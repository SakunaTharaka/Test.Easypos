// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCeXZ4FSZ9FQWSSjo_HM1fWOdS_hku2S3g",
  authDomain: "easypos-lk.firebaseapp.com",
  projectId: "easypos-lk",
  storageBucket: "easypos-lk.appspot.com",
  messagingSenderId: "504522313140",
  appId: "1:504522313140:web:cc196e4ff1d4ff4cd7b6e1",
  measurementId: "G-PXT50E3YMB",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
