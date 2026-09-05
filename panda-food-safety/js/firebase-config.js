// ── EDIT THIS FILE ──────────────────────────────────────────────────
// Paste your Firebase project's config here (Firebase Console → Project
// settings → General → "Your apps" → SDK setup and configuration).
// See README.md for the full setup walkthrough.

export const firebaseConfig = {
  apiKey: "AIzaSyCFzw0BvyZxXtZNRZmKMCIOCx8BruuxDso",
  authDomain: "food-safety-walkthrough.firebaseapp.com",
  projectId: "food-safety-walkthrough",
  storageBucket: "food-safety-walkthrough.firebasestorage.app",
  messagingSenderId: "843008741924",
  appId: "1:843008741924:web:b85c928853affd534c3eb1",
};

// The one owner email — full admin access, and the only account that
// can add or remove other admins from the "Manage Admins" tab. This
// must exactly match the email you sign up with on the admin login
// screen. This value is also mirrored in firestore.rules (OWNER_EMAIL),
// so update both together if it ever changes. Every other admin is
// added later from inside the app itself (Manage Admins tab) — no code
// change needed for them.
export const OWNER_EMAIL = "radwar0224@gmail.com";
