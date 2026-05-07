// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDhggNrOJIgA8kiI7gqgDji04kVE1rTPUA",
  authDomain: "couple-expectation.firebaseapp.com",
  projectId: "couple-expectation",
  storageBucket: "couple-expectation.firebasestorage.app",
  messagingSenderId: "861185260503",
  appId: "1:861185260503:web:a7a7181d3e2d8663c2e992",
  measurementId: "G-J4RKTPFEXS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);