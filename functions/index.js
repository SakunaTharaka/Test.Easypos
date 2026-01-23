const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require('crypto');
const fs = require('fs');

admin.initializeApp();
const db = admin.firestore();

// Set Limits
setGlobalOptions({ maxInstances: 10 });

// CONFIGURATION
const TEXT_LK_API_TOKEN = "1594|WMi7mCcEEI3Ajkg4oMG2EeU7cA03k6oKIN81ouJ901ddfb53"; 

// --- HELPER: SEND SMS ---
async function sendSMS(mobile, message, senderId = "QuickPOS") {
  if (!mobile) return;
  if (mobile.toString().startsWith("011")) return; 

  try {
    let recipient = mobile.toString();
    if (recipient.startsWith("0")) {
      recipient = "94" + recipient.substring(1);
    }

    const payload = {
      recipient: recipient,
      sender_id: senderId,
      type: "plain",
      message: message
    };

    const config = {
      headers: {
        "Authorization": `Bearer ${TEXT_LK_API_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };

    await axios.post("https://app.text.lk/api/v3/sms/send", payload, config);
  } catch (error) {
    console.error("SMS Error:", error.message);
  }
}

// 1. MONTHLY RESET (SMART DATE LOGIC)
exports.resetMonthlySmsCredits = onSchedule({
    schedule: "every day 00:00",
    timeZone: "Asia/Colombo",
}, async (event) => {
    const today = new Date();
    const currentDay = today.getDate(); 
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); 

    // Get the total number of days in the current month
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const usersSnapshot = await db.collection("Userinfo").get();
    const batch = db.batch();
    let operationCount = 0;

    usersSnapshot.docs.forEach((doc) => {
        const userData = doc.data();
        if (userData.trialStartDate) {
            const startDate = userData.trialStartDate.toDate ? userData.trialStartDate.toDate() : new Date(userData.trialStartDate);
            const registrationDay = startDate.getDate(); 

            let shouldReset = false;

            // Smart Reset Logic:
            if (registrationDay <= daysInCurrentMonth) {
                // If reg day exists in this month, reset on that day
                if (currentDay === registrationDay) shouldReset = true;
            } else {
                // If reg day doesn't exist (e.g., 31st in Feb), reset on last day of month
                if (currentDay === daysInCurrentMonth) shouldReset = true;
            }

            if (shouldReset) {
                // Reset ONLY Free credits
                batch.update(doc.ref, { smsCredits: 350 });
                operationCount++;
            }
        }
    });

    if (operationCount > 0) {
        await batch.commit();
        console.log(`Reset Free SMS credits for ${operationCount} users.`);
    }
});

// 2. SEND INVOICE SMS
exports.sendInvoiceSms = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');
    
    const uid = request.auth.uid;
    const { mobile, customMessage, creditsToDeduct } = request.data;

    if (!mobile || !customMessage) throw new HttpsError('invalid-argument', 'Missing data.');

    const cost = creditsToDeduct || 1; 

    await db.runTransaction(async (transaction) => {
        const userRef = db.collection("Userinfo").doc(uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

        const userData = userDoc.data();
        const freeCredits = userData.smsCredits || 0;
        const paidCredits = userData.extraSmsCredits || 0; 
        const totalAvailable = freeCredits + paidCredits;

        if (totalAvailable < cost) {
            throw new HttpsError('resource-exhausted', `Insufficient credits. Need ${cost}, have ${totalAvailable}`);
        }

        // Send Invoice SMS invoices ***************************
        await sendSMS(mobile, customMessage, "QuickPOS");

        // Deduct Logic: Free First
        let newFree = freeCredits;
        let newPaid = paidCredits;
        let remainingCost = cost;

        if (newFree >= remainingCost) {
            newFree -= remainingCost;
        } else {
            remainingCost -= newFree;
            newFree = 0;
            newPaid -= remainingCost;
        }

        transaction.update(userRef, { 
            smsCredits: newFree,
            extraSmsCredits: newPaid
        });
    });

    return { success: true };
});

// 3. QZ SIGNATURE
exports.getQzSignature = onCall((request) => {
    const toSign = request.data.requestToSign;
    try {
        const privateKey = fs.readFileSync('./private-key.pem', 'utf8');
        const signer = crypto.createSign('SHA1');
        signer.update(toSign);
        const signature = signer.sign(privateKey, 'base64');
        return { signature: signature };
    } catch (err) {
        throw new HttpsError('internal', 'Sign Error');
    }
});

// 4. OTP REQUEST
exports.requestOtp = onCall(async (request) => {
    const mobile = request.data.mobile;
    if (!mobile) throw new HttpsError('invalid-argument', 'Phone required');

    const globalDocRef = db.collection('global_settings').doc('verified_numbers');
    const globalDocSnap = await globalDocRef.get();
    if (globalDocSnap.exists) {
        const usedNumbers = globalDocSnap.data().list || [];
        if (usedNumbers.includes(mobile)) throw new HttpsError('already-exists', 'Number already registered.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.collection('otp_codes').doc(mobile).set({
        code: otp,
        expiresAt: Date.now() + 5 * 60 * 1000, 
    });
    await sendSMS(mobile, `Your QuickPOS Code: ${otp}`);
    return { success: true };
});

// 5. OTP VERIFY
exports.verifyOtp = onCall(async (request) => {
    const { mobile, code } = request.data;
    const docRef = db.collection('otp_codes').doc(mobile);
    const docSnap = await docRef.get();

    if (!docSnap.exists) throw new HttpsError('not-found', 'OTP not found');
    const data = docSnap.data();
    
    if (Date.now() > data.expiresAt) {
        await docRef.delete();
        throw new HttpsError('deadline-exceeded', 'Expired');
    }

    if (data.code === code.toString()) {
        await docRef.delete();
        await db.collection('global_settings').doc('verified_numbers').set({
            list: admin.firestore.FieldValue.arrayUnion(mobile)
        }, { merge: true });
        return { success: true };
    } else {
        throw new HttpsError('permission-denied', 'Invalid Code');
    }
});

// 6. WELCOME MSG & EXPIRY CHECK
exports.sendWelcomeMessage = onDocumentCreated("Userinfo/{userId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const userData = snapshot.data();
    await sendSMS(userData.phone, `Hi ${userData.fullName}, Welcome to QuickPOS! Support: 078 722 3407`);
});

exports.checkSubscriptionExpiry = onSchedule({
    schedule: "every day 09:00",
    timeZone: "Asia/Colombo",
}, async (event) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);

    const users = await db.collection("Userinfo").where("status", "==", "trialing").get();
    users.docs.forEach(async (doc) => {
        const u = doc.data();
        if(!u.trialEndDate) return;
        const end = u.trialEndDate.toDate();
        end.setHours(0,0,0,0);

        if(end.getTime() === twoDaysFromNow.getTime()) {
             await sendSMS(u.phone, "QuickPOS: 2 days left in your subscription. Please renew.");
        } else if (end.getTime() === today.getTime()) {
             await sendSMS(u.phone, "QuickPOS: Subscription expired today. Please contact support.");
        }
    });
});

// 7. SECURE START TRIAL
exports.startTrial = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');
    
    const uid = request.auth.uid;
    const { plan } = request.data;

    const trialStartDate = new Date();
    const trialEndDate = new Date(trialStartDate);
    trialEndDate.setDate(trialStartDate.getDate() + 7);

    await db.collection("Userinfo").doc(uid).set({
        selectedPackage: plan || 'monthly',
        trialStartDate: admin.firestore.Timestamp.fromDate(trialStartDate),
        trialEndDate: admin.firestore.Timestamp.fromDate(trialEndDate),
        status: 'trialing',
        smsCredits: 350 
    }, { merge: true });

    return { success: true };
});

// 8. ✅ SECURE: ADMIN ADD CREDITS + NOTIFICATION SMS
exports.adminAddCredits = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
    
    const { targetUid, amount } = request.data;
    const credits = parseInt(amount);

    if (!targetUid || isNaN(credits)) throw new HttpsError('invalid-argument', 'Invalid data');

    const userRef = db.collection("Userinfo").doc(targetUid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) throw new HttpsError('not-found', 'User not found');

    // 1. Add Credits Safely
    await userRef.set({
        extraSmsCredits: admin.firestore.FieldValue.increment(credits)
    }, { merge: true });

    // 2. Send SMS Notification
    const userData = userSnap.data();
    if (userData.phone) {
        const msg = `QuickPOS: Thank you for your purchase. You just bought ${credits} credits.`;
        await sendSMS(userData.phone, msg, "QuickPOS");
    }

    return { success: true, message: `Added ${credits} credits and sent SMS.` };
});

// 9. SECURE: ADMIN EXTEND TRIAL
exports.adminExtendTrial = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');

    const { targetUid, days } = request.data;
    const daysToAdd = parseInt(days);

    if (!targetUid || isNaN(daysToAdd)) throw new HttpsError('invalid-argument', 'Invalid data');

    const userRef = db.collection("Userinfo").doc(targetUid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) throw new HttpsError('not-found', 'User not found');

    const currentEnd = userSnap.data().trialEndDate?.toDate() || new Date();
    const today = new Date();
    
    const baseDate = currentEnd > today ? currentEnd : today;
    baseDate.setDate(baseDate.getDate() + daysToAdd);

    await userRef.update({
        trialEndDate: admin.firestore.Timestamp.fromDate(baseDate)
    });

    return { success: true, newDate: baseDate };
});