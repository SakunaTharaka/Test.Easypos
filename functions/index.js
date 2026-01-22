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

// Set Limits to prevent high costs
setGlobalOptions({ maxInstances: 10 });

// ====================================================
// ⚙️ CONFIGURATION
// ====================================================
const TEXT_LK_API_TOKEN = "1594|WMi7mCcEEI3Ajkg4oMG2EeU7cA03k6oKIN81ouJ901ddfb53"; 

// ====================================================
// 🛠️ HELPER: SEND SMS (With 011 Filter)
// ====================================================
async function sendSMS(mobile, message, senderId = "QuickPOS") {
  if (!mobile) return;

  // 1. 🛑 FILTER: Ignore Colombo Landlines
  if (mobile.toString().startsWith("011")) {
    console.log(`🚫 Skipped SMS for landline: ${mobile}`);
    return;
  }

  try {
    // 2. FORMAT: Convert '077...' to '9477...'
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
    // Don't throw, just log, so transactions don't fail if SMS API is down
  }
}

// ====================================================
// 1. 📅 MONTHLY SMS CREDIT RESET
// ====================================================
exports.resetMonthlySmsCredits = onSchedule({
    schedule: "every day 00:00",
    timeZone: "Asia/Colombo",
}, async (event) => {
    const today = new Date();
    const currentDay = today.getDate();
    
    // Fetch all active users
    const usersSnapshot = await db.collection("Userinfo").get();
    
    const batch = db.batch();
    let operationCount = 0;

    usersSnapshot.docs.forEach((doc) => {
        const userData = doc.data();
        if (userData.trialStartDate) {
            const startDate = userData.trialStartDate.toDate ? userData.trialStartDate.toDate() : new Date(userData.trialStartDate);
            // Check if today is the anniversary day
            if (startDate.getDate() === currentDay) {
                // Reset credits to 350
                batch.update(doc.ref, { smsCredits: 350 });
                operationCount++;
            }
        }
    });

    if (operationCount > 0) {
        await batch.commit();
        console.log(`Reset SMS credits for ${operationCount} users.`);
    }
});

// ====================================================
// 2. 📨 SEND INVOICE SMS (Updated for Smart Credits)
// ====================================================
exports.sendInvoiceSms = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');
    
    const uid = request.auth.uid;
    // Accepting new parameters from Invoice.js
    const { mobile, customMessage, creditsToDeduct } = request.data;

    if (!mobile || !customMessage) {
        throw new HttpsError('invalid-argument', 'Missing mobile number or message.');
    }

    const creditsCost = creditsToDeduct || 1; // Default to 1 if missing

    await db.runTransaction(async (transaction) => {
        const userRef = db.collection("Userinfo").doc(uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) throw new HttpsError('not-found', 'User profile not found.');

        const userData = userDoc.data();
        const currentCredits = userData.smsCredits || 0;

        // 🛑 Check Balance
        if (currentCredits < creditsCost) {
            throw new HttpsError('resource-exhausted', `Insufficient SMS credits. Required: ${creditsCost}, Available: ${currentCredits}`);
        }

        // 1. Send SMS using "Wayne" Sender ID (Invoice SMS sending )
        await sendSMS(mobile, customMessage, "Wayne");

        // 2. Deduct Credits
        transaction.update(userRef, { 
            smsCredits: currentCredits - creditsCost 
        });
    });

    return { success: true };
});

// ====================================================
// 3. 🖨️ QZ TRAY SIGNATURE
// ====================================================
exports.getQzSignature = onCall((request) => {
    const toSign = request.data.requestToSign;
    try {
        const privateKey = fs.readFileSync('./private-key.pem', 'utf8');
        const signer = crypto.createSign('SHA1');
        signer.update(toSign);
        const signature = signer.sign(privateKey, 'base64');
        return { signature: signature };
    } catch (err) {
        console.error("QZ Sign Error:", err);
        throw new HttpsError('internal', 'Failed to sign print request.');
    }
});

// ====================================================
// 4. 🔢 REQUEST OTP
// ====================================================
exports.requestOtp = onCall(async (request) => {
    const mobile = request.data.mobile;
    if (!mobile) throw new HttpsError('invalid-argument', 'Phone number is required');

    // Check duplicate globally
    const globalDocRef = db.collection('global_settings').doc('verified_numbers');
    const globalDocSnap = await globalDocRef.get();
    if (globalDocSnap.exists) {
        const usedNumbers = globalDocSnap.data().list || [];
        if (usedNumbers.includes(mobile)) {
            throw new HttpsError('already-exists', 'Number already registered.');
        }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection('otp_codes').doc(mobile).set({
        code: otp,
        expiresAt: Date.now() + 5 * 60 * 1000, 
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const msg = `Your QuickPOS Verification Code is: ${otp}`;
    await sendSMS(mobile, msg);

    return { success: true, message: "OTP sent successfully" };
});

// ====================================================
// 5. ✅ VERIFY OTP
// ====================================================
exports.verifyOtp = onCall(async (request) => {
    const mobile = request.data.mobile;
    const userCode = request.data.code;

    if (!mobile || !userCode) throw new HttpsError('invalid-argument', 'Missing Data');

    const docRef = db.collection('otp_codes').doc(mobile);
    const docSnap = await docRef.get();

    if (!docSnap.exists) throw new HttpsError('not-found', 'No OTP request found');

    const data = docSnap.data();
    if (Date.now() > data.expiresAt) {
        await docRef.delete();
        throw new HttpsError('deadline-exceeded', 'OTP Expired');
    }

    if (data.code === userCode.toString()) {
        await docRef.delete();
        // Lock the number globally
        await db.collection('global_settings').doc('verified_numbers').set({
            list: admin.firestore.FieldValue.arrayUnion(mobile)
        }, { merge: true });

        return { success: true, message: "Verified" };
    } else {
        throw new HttpsError('permission-denied', 'Invalid Code');
    }
});

// ====================================================
// 6. 👋 WELCOME & EXPIRY NOTIFICATIONS
// ====================================================
exports.sendWelcomeMessage = onDocumentCreated("Userinfo/{userId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const userData = snapshot.data();
    const msg = `Hi ${userData.fullName || "Customer"}, Thank you for using QuickPOS! Support: 078 722 3407`;
    await sendSMS(userData.phone, msg);
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

// ====================================================
// 7. ✅ NEW: SECURE START TRIAL
// ====================================================
exports.startTrial = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');
    
    const uid = request.auth.uid;
    const { plan } = request.data;

    const trialStartDate = new Date();
    const trialEndDate = new Date(trialStartDate);
    trialEndDate.setDate(trialStartDate.getDate() + 7);

    // This runs as Admin, bypassing frontend rules
    await db.collection("Userinfo").doc(uid).set({
        selectedPackage: plan || 'monthly',
        trialStartDate: admin.firestore.Timestamp.fromDate(trialStartDate),
        trialEndDate: admin.firestore.Timestamp.fromDate(trialEndDate),
        status: 'trialing',
        smsCredits: 350 // ✅ Safely initialized
    }, { merge: true });

    return { success: true };
});