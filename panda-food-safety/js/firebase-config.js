// ── EDIT THIS FILE ──────────────────────────────────────────────────
// Paste your Firebase project's config here (Firebase Console → Project
// settings → General → "Your apps" → SDK setup and configuration).
// See README.md for the full setup walkthrough.

export const firebaseConfig = {
  apiKey: "AIzaSyCFzw0BVyZxXtZNRZmKMCIOCx8BruuxDso",
  authDomain: "food-safety-walkthrough.firebaseapp.com",
  projectId: "food-safety-walkthrough",
  storageBucket: "food-safety-walkthrough.firebasestorage.app",
  messagingSenderId: "843008741924",
  appId: "1:843008741924:web:b85c928853affd534c3eb1",
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
