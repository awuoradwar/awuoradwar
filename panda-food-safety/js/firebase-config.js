// ── EDIT THIS FILE ──────────────────────────────────────────────────
// Paste your Firebase project's config here (Firebase Console → Project
// settings → General → "Your apps" → SDK setup and configuration).
// See README.md for the full setup walkthrough.

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID_HERE.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID_HERE",
  storageBucket: "PASTE_PROJECT_ID_HERE.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID_HERE",
  appId: "PASTE_APP_ID_HERE",
};

// The exact two admin email addresses that may log into the Admin
// dashboard. These must match Firebase Authentication → Users (Email/
// Password provider) accounts you create for the two admins — see
// README.md. This list is also mirrored in firestore.rules and
// storage.rules, so update all three together if an admin email changes.
export const ADMIN_EMAILS = [
  "admin1@example.com",
  "admin2@example.com",
];
