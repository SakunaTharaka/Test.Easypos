/**
 * Import function triggers from their respective submodules:
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { setGlobalOptions } = require("firebase-functions");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// --- PRESERVE YOUR EXISTING SETTINGS ---
// For cost control, limit max instances to 10
setGlobalOptions({ maxInstances: 10 });

// ====================================================
// ⚙️ CONFIGURATION (PASTE YOUR DETAILS HERE)
// ====================================================
const TEXT_LK_API_TOKEN = "1594|WMi7mCcEEI3Ajkg4oMG2EeU7cA03k6oKIN81ouJ901ddfb53 "; // 🔴 REPLACE THIS
const SENDER_ID = "Wayne"; // 🔴 Your Sender ID

// ====================================================
// 🛠️ HELPER: SEND SMS (With 011 Filter & Formatting)
// ====================================================
async function sendSMS(mobile, message) {
  if (!mobile) return;

  // 1. 🛑 FILTER: Ignore Colombo Landlines (Start with 011)
  if (mobile.toString().startsWith("011")) {
    console.log(`🚫 Skipped SMS for landline number: ${mobile}`);
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

    // Sending to Text.lk
    const response = await axios.post("https://app.text.lk/api/v3/sms/send", payload, config);
    
    if (response.data && response.data.status === "success") {
      console.log(`✅ SMS sent to ${recipient}: Success`);
    } else {
      console.error(`⚠️ SMS API Error:`, response.data);
    }

  } catch (error) {
    console.error("❌ SMS Network Error:", error.response ? error.response.data : error.message);
  }
}

// ====================================================
// 1. 👋 WELCOME MESSAGE (Triggers on Registration)
// ====================================================
exports.sendWelcomeMessage = functions.firestore
  .document("Userinfo/{userId}")
  .onCreate(async (snap, context) => {
    const userData = snap.data();
    const phone = userData.phone; 
    const name = userData.fullName || "Customer";

    const msg = `Hi ${name}, Thank you for using QuickPOS! Your trial has started. Contact 0787223407 for support.`;

    await sendSMS(phone, msg);
  });

// ====================================================
// 2. ⏳ DAILY EXPIRY CHECK (Runs daily at 9:00 AM)
// ====================================================
exports.checkSubscriptionExpiry = functions.pubsub
  .schedule("every day 09:00")
  .timeZone("Asia/Colombo")
  .onRun(async (context) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);

    // --- A. WARNING (48 Hours Left) ---
    // Finds users whose trial expires exactly 2 days from now
    const warningQuery = await db.collection("Userinfo")
      .where("status", "==", "trialing") 
      .where("trialEndDate", ">=", admin.firestore.Timestamp.fromDate(twoDaysFromNow))
      .where("trialEndDate", "<", admin.firestore.Timestamp.fromDate(new Date(twoDaysFromNow.getTime() + 86400000))) 
      .get();

    warningQuery.docs.forEach(async (doc) => {
      const user = doc.data();
      if (user.phone) {
        const msg = `QuickPOS Alert: You have 2 days left in your subscription. To avoid interruption, please make a payment. Contact: 078 722 3407`;
        await sendSMS(user.phone, msg);
      }
    });

    // --- B. EXPIRED (Today) ---
    // Finds users whose trial expires today
    const expiryQuery = await db.collection("Userinfo")
      .where("status", "==", "trialing")
      .where("trialEndDate", ">=", admin.firestore.Timestamp.fromDate(today))
      .where("trialEndDate", "<", admin.firestore.Timestamp.fromDate(new Date(today.getTime() + 86400000)))
      .get();

    expiryQuery.docs.forEach(async (doc) => {
      const user = doc.data();
      if (user.phone) {
        const msg = `QuickPOS Notice: Your subscription ended today. You can no longer use the system. Please contact 078 722 3407 to renew.`;
        await sendSMS(user.phone, msg);
      }
    });

    return null;
  });