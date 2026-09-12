// Central Firebase setup — every other module imports `auth`, `db`, and
// the re-exported SDK helpers from here so there's one place that knows
// the SDK version.
//
// Submission photos are still base64 in Firestore, not Storage (see
// js/app.js) -- that decision predates this project needing the Blaze
// (billing-account) plan at all. Storage IS used for the weekly report
// slide decks: the project already requires Blaze for Cloud Functions
// to run, so enabling Storage doesn't cross a new billing line, and a
// once-a-week generated file is a very different growth pattern than a
// photo per submission.

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
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
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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
import { getStorage, ref, getBytes } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

import { firebaseConfig, OWNER_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Without a persistent local cache, every one-time getDocs() call is a
// brand-new network round trip with nothing to fall back on -- on a
// real store's flaky/locked-down wifi, these were observed to hang
// indefinitely (until the app's own 20s timeout) even while an already-
// open realtime onSnapshot listener (e.g. the notification bell) kept
// working fine on the same connection. Enabling IndexedDB-backed
// persistence is Firebase's own documented fix for exactly this: it lets
// getDocs() serve from the synced local cache instead of only ever
// waiting on a fresh server round trip, and lets ordinary reads share
// the same underlying connection health as the realtime listeners that
// were already proven to work. Single-tab manager: this app is never
// expected to be open in two tabs of the same origin at once.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
const storage = getStorage(app);

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

// Creates a brand-new account without touching whichever session is
// currently active on the primary `auth` above. Firebase's
// createUserWithEmailAndPassword always signs in as the account it just
// created — fine for someone creating their own account, but wrong for
// an owner minting a username-based account on someone else's behalf
// from Manage Admins, which would otherwise silently sign the owner out
// of their own session. A short-lived secondary Firebase App instance is
// the standard client-only way around that, with no backend/Admin SDK.
let secondaryAppCounter = 0;
async function createUserOnSecondaryApp(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}-${secondaryAppCounter++}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return cred.user;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export {
  auth,
  db,
  storage,
  ref,
  getBytes,
  OWNER_EMAIL,
  persistenceReady,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  createUserOnSecondaryApp,
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
