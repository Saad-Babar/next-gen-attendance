// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBAFkBunYLiVhQJWRh-W5pL2VF2XLMEqR0",
  authDomain: "nex-gen-attendance.firebaseapp.com",
  projectId: "nex-gen-attendance",
  storageBucket: "nex-gen-attendance.firebasestorage.app",
  messagingSenderId: "752628023953",
  appId: "1:752628023953:web:0ae9e3de741a6e7b92f530",
  measurementId: "G-JFL8KEFV0B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const storage = getStorage(app);