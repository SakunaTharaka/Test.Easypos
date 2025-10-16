// Import necessary modules
const functions = require("firebase-functions");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Declare the privateKey variable here, but don't load it yet.
let privateKey;

/**
 * An HTTPS Callable function that signs data sent from the frontend.
 */
exports.getQzSignature = functions.https.onCall(async (data, context) => {
  // This is the "lazy loading" part.
  // The key is only loaded from the file the first time the function runs.
  if (!privateKey) {
    console.log("Initializing private key...");
    privateKey = fs.readFileSync(path.join(__dirname, "private-key.pem"));
  }

  // Ensure the frontend sent the data that needs signing
  if (!data.requestToSign) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with \"requestToSign\" data.",
    );
  }

  try {
    // Use Node.js's built-in crypto library to create a signer
    const signer = crypto.createSign("sha512");

    // Add the exact string QZ Tray wants to sign
    signer.update(data.requestToSign);

    // Sign it with your private key and encode it in base64 format
    const signature = signer.sign(privateKey, "base64");

    // Send the signature back to the React app
    return {signature: signature};
  } catch (error) {
    // Log any errors for debugging
    console.error("Error signing request:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Failed to generate QZ Tray signature.",
    );
  }
});
