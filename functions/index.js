const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https"); // ✅ Added for OTP
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// Set Limits to prevent high costs
setGlobalOptions({ maxInstances: 10 });

// ====================================================
// ⚙️ CONFIGURATION
// ====================================================
const TEXT_LK_API_TOKEN = "1594|WMi7mCcEEI3Ajkg4oMG2EeU7cA03k6oKIN81ouJ901ddfb53"; 
const SENDER_ID = "Wayne"; 

// ====================================================
// 🛠️ HELPER: SEND SMS (With 011 Filter)
// ====================================================
async function sendSMS(mobile, message) {
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

    // 3. API REQUEST (Text.lk v3)
    const payload = {
      recipient: recipient,
      sender_id: SENDER_ID,
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

    const response = await axios.post("https://app.text.lk/api/v3/sms/send", payload, config);
    
    if (response.data && response.data.status === "success") {
      console.log(`✅ SMS sent to ${recipient}`);
    } else {
      console.error(`⚠️ SMS API Error:`, response.data);
    }

  } catch (error) {
    console.error("❌ Network Error:", error.response ? error.response.data : error.message);
  }
}

// ====================================================
// 1. 👋 WELCOME MESSAGE (V2 Trigger)
// ====================================================
exports.sendWelcomeMessage = onDocumentCreated("Userinfo/{userId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return; // No data found

    const userData = snapshot.data();
    const phone = userData.phone; 
    const name = userData.fullName || "Customer";

    const msg = `Hi ${name}, Thank you for using QuickPOS! Your trial has started. Contact 078 722 3407 for support.`;

    await sendSMS(phone, msg);
});

// ====================================================
// 2. ⏳ DAILY EXPIRY CHECK (V2 Scheduler)
// ====================================================
exports.checkSubscriptionExpiry = onSchedule({
    schedule: "every day 09:00",
    timeZone: "Asia/Colombo",
}, async (event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);

    // --- A. WARNING (48 Hours Left) ---
    const warningQuery = await db.collection("Userinfo")
      .where("status", "==", "trialing") 
      .where("trialEndDate", ">=", admin.firestore.Timestamp.fromDate(twoDaysFromNow))
      .where("trialEndDate", "<", admin.firestore.Timestamp.fromDate(new Date(twoDaysFromNow.getTime() + 86400000))) 
      .get();

    warningQuery.docs.forEach(async (doc) => {
      const user = doc.data();
      const msg = `You have 2 days left in your subscription. Please make a payment. If payment is already settled, please ignore this message.For more informations contact: 078 722 3407`;
      await sendSMS(user.phone, msg);
    });

    // --- B. EXPIRED (Today) ---
    const expiryQuery = await db.collection("Userinfo")
      .where("status", "==", "trialing")
      .where("trialEndDate", ">=", admin.firestore.Timestamp.fromDate(today))
      .where("trialEndDate", "<", admin.firestore.Timestamp.fromDate(new Date(today.getTime() + 86400000)))
      .get();

    expiryQuery.docs.forEach(async (doc) => {
      const user = doc.data();
      const msg = `QuickPOS Notice: Your subscription ended today. You can no longer use the system. Please contact 078 722 3407 to renew. **If payment is already settled, please ignore this message.`;
      await sendSMS(user.phone, msg);
    });
});

// ====================================================
// 3. 🔢 REQUEST OTP (With Duplicate Check)
// ====================================================
exports.requestOtp = onCall(async (request) => {
    const mobile = request.data.mobile;
    if (!mobile) {
        throw new HttpsError('invalid-argument', 'Phone number is required');
    }

    // 🔒 CHECK: Is this number already verified globally?
    const globalDocRef = db.collection('global_settings').doc('verified_numbers');
    const globalDocSnap = await globalDocRef.get();

    if (globalDocSnap.exists) {
        const data = globalDocSnap.data();
        const usedNumbers = data.list || [];
        
        if (usedNumbers.includes(mobile)) {
            // 🚫 STOP: Number exists
            throw new HttpsError('already-exists', 'The mobile number you entered is already associated with an existing account.');
        }
    }

    // Generate 6-digit Random Code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to 'otp_codes' collection (Expires in 5 minutes)
    await db.collection('otp_codes').doc(mobile).set({
        code: otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 mins from now
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send SMS
    const msg = `Your QuickPOS Verification Code is: ${otp}`;
    await sendSMS(mobile, msg);

    return { success: true, message: "OTP sent successfully" };
});

// ====================================================
// 4. ✅ VERIFY OTP (And Add to Global List)
// ====================================================
exports.verifyOtp = onCall(async (request) => {
    const mobile = request.data.mobile;
    const userCode = request.data.code;

    if (!mobile || !userCode) {
        throw new HttpsError('invalid-argument', 'Phone and Code are required');
    }

    const docRef = db.collection('otp_codes').doc(mobile);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        throw new HttpsError('not-found', 'No OTP request found for this number');
    }

    const data = docSnap.data();

    // Check Expiry
    if (Date.now() > data.expiresAt) {
        await docRef.delete();
        throw new HttpsError('deadline-exceeded', 'OTP has expired. Please request a new one.');
    }

    // Check Match
    if (data.code === userCode.toString()) {
        await docRef.delete(); // Remove OTP
        
        // 🔒 SUCCESS: Add number to global 'verified_numbers' list
        // This prevents future registrations with this number
        await db.collection('global_settings').doc('verified_numbers').set({
            list: admin.firestore.FieldValue.arrayUnion(mobile)
        }, { merge: true });

        return { success: true, message: "Phone verified!" };
    } else {
        throw new HttpsError('permission-denied', 'Invalid Code. Please try again.');
    }
});