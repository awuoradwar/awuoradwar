// Central Firebase setup — every other module imports `auth`, `db`, and
// the re-exported SDK helpers from here so there's one place that knows
// the SDK version.
//
// No Cloud Storage here on purpose: as of Oct 2024 Cloud Storage for
// Firebase requires the Blaze (billing-account) plan even for free-tier
// usage. Photos are stored as compressed base64 image data directly in
// Firestore instead (see js/app.js), which stays on the no-cost Spark
// plan with no credit card required.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import { firebaseConfig, OWNER_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Explicit rather than relying on the SDK's default: keeps a signed-in
// admin/associate logged in across page reloads and browser restarts on
// this device, instead of a session that ends when the tab closes.
// Firebase's own refresh tokens don't expire on a fixed schedule (no
// native "log out after 30 days" setting exists on the free Auth tier) —
// this is what keeps someone from having to re-enter a password every
// time they open the app, short of explicitly logging out or the
// browser clearing its own site data.
//
// Exported as a promise rather than awaited at the top level of this
// module: top-level await is a parser-level feature — on a browser old
// enough not to support it, the whole module (and everything that
// imports it) fails to even load, with no error visible to whoever's
// holding the phone, just a blank page. Every consumer that signs in
// awaits this first instead, which needs nothing beyond ordinary
// async/await inside a function — supported everywhere ES modules are.
// It guards against a real, documented Firebase race: a sign-in call
// issued while setPersistence() is still pending can silently fail.
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {});

export {
  auth,
  db,
  OWNER_EMAIL,
  persistenceReady,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
};
