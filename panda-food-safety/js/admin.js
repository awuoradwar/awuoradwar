import {
  auth,
  db,
  storage,
  ref,
  getBytes,
  OWNER_EMAIL,
  persistenceReady,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  createUserOnSecondaryApp,
  sendPasswordResetEmail,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "./firebase-init.js";

// One-time rollout concession: official day-to-day use starts on this
// date, so a store not submitting on an earlier "today" in Today's Status
// shouldn't read as a missed/penalized day. This naturally stops applying
// once today reaches the date, so it's safe to leave in place after launch.
const LAUNCH_DATE = "2026-09-07";

// Firebase Auth still needs a real-looking email under the hood even for
// a "username" account — this fixed, never-actually-delivered domain is
// what a username gets turned into. Nobody needs an inbox for it; it's
// only ever used internally for sign-in. The `usernames/{username}`
// Firestore collection maps a chosen username back to this email so the
// login screen can resolve one from the other before signing in.
const USERNAME_EMAIL_SUFFIX = "@users.pandafoodsafety.internal";

function normalizeUsername(raw) {
  return (raw || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function syntheticEmailForUsername(username) {
  return `${normalizeUsername(username)}${USERNAME_EMAIL_SUFFIX}`;
}

// A soft app-lock only, never a credential of its own: it gates the
// dashboard while this device's Firebase session is still valid, purely
// to avoid re-typing a full password on every reopen. It's deliberately
// stored device-local (never Firestore) and never substitutes for real
// sign-in — a genuine logout (iOS clearing storage, or an explicit Log
// Out) always requires the real password again, autofilled from Safari's
// Keychain where possible.
const PIN_STORAGE_KEY = "pfs-admin-pin-v1";

function loadPinRecord() {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPinRecord() {
  try {
    localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {}
}

function randomSaltHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

async function savePinForEmail(email, pin) {
  const salt = randomSaltHex();
  const hash = await hashPin(pin, salt);
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify({ email, salt, hash }));
  } catch {}
}

async function verifyPin(pin) {
  const record = loadPinRecord();
  if (!record) return false;
  return (await hashPin(pin, record.salt)) === record.hash;
}

let initialized = false;
let root;
let currentUserEmail = null;
// Set once this device's PIN (if any) has been satisfied for the current
// page load, so switching tabs doesn't re-prompt — only a fresh app open
// (or a real logout/login) does.
let pinUnlockedThisLoad = false;
let pinFailedAttempts = 0;
// Carries a message across the signOut() -> onAuthStateChanged(null) hop
// (e.g. "too many attempts") since that transition is driven by the
// Firebase listener, not a direct function call we can pass a message into.
let pendingLoginMessage = null;
// Reset to "today" on every sign-in transition (see handleAuthChange) —
// a previously-open tab (e.g. History) is only kept while switching
// tabs within the same still-signed-in session, never restored across a
// reload or carried over when a different person logs in.
let activeTab = "today";
// Tracks the document-level click listener renderDashboard() installs
// to close the account/more-tabs dropdowns — removed and re-added on
// every render instead of just piling up. Without this, each dropdown
// listener re-queries the dashboard's DOM at click time, and once that
// DOM has been replaced by a different screen (e.g. after logging out)
// every stale copy throws trying to set `.hidden` on null.
let closeDropdownsListener = null;
let storesCache = [];
let storesUnsub = null;
let unresolvedAiFlagsCount = 0;
let aiFlagsUnsub = null;
let lastHistoryResults = [];
// Names seen in any submission doc fetched so far this session (History,
// Weekly Summary) — there's no Firestore "distinct conductedBy" query, so
// this is built up opportunistically from whatever's already been read,
// purely to power the History name-filter's autocomplete suggestions.
let knownConductedByNames = new Set();
function recordKnownNames(docs) {
  for (const d of docs) {
    if (d.conductedBy) knownConductedByNames.add(d.conductedBy);
  }
}
let isOwnerSession = false;
let editingStoreId = null;
let adminsCache = [];
let adminsUnsub = null;
let expandedChecklistSectionId = null;
let editingChecklistItemId = null;
let addingItemToSectionId = null;
let editingChecklistSectionId = null;
let addingSectionToGroupId = null;
let weeklyOffset = 0;
let repeatViolationsOffset = 0;
let weeklyReportOffset = 0;
let autoDateRefreshStarted = false;
let lastKnownDate = null;

export function initAdminApp() {
  if (initialized) return;
  initialized = true;
  root = document.getElementById("admin-root");
  onAuthStateChanged(auth, handleAuthChange);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Stores can be number-only — a name is optional, not every store has (or
// needs) a descriptive one.
function storeLabel(number, name) {
  return name ? `${number} — ${name}` : String(number);
}

// Type-to-filter store picker: a text input backed by a hidden field that
// holds the actual selected store's value (or "" for "none selected" / "all
// stores"). Typing narrows a dropdown of matches by number or name; picking
// one (or pressing Enter with a single unambiguous match) fills the text
// input and closes the list. valueKey picks what's stored in hiddenEl —
// "number" for admin filtering, "id" for the associate's store doc lookup.
function wireStoreCombo({ inputEl, hiddenEl, listEl, stores, allLabel, valueKey = "number", onSelect }) {
  if (!inputEl || !hiddenEl || !listEl) return;
  const notify = onSelect || (() => {});

  function currentMatches(filterText) {
    const q = filterText.trim().toLowerCase();
    return stores.filter((s) => !q || s.number.toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q));
  }

  function select(s) {
    inputEl.value = s ? storeLabel(s.number, s.name) : "";
    hiddenEl.value = s ? s[valueKey] : "";
    listEl.hidden = true;
    notify(s || null);
  }

  function renderList(filterText) {
    const q = filterText.trim();
    // The list scrolls (max-height + overflow-y in CSS), so there's no
    // need to truncate — capping here just hid real stores past the
    // 8th once a business has more locations than that.
    const matches = currentMatches(filterText);

    const allRow = q || !allLabel ? "" : `<button type="button" class="store-combo-item store-combo-all" data-all="1">${escapeHtml(allLabel)}</button>`;
    listEl.innerHTML =
      allRow +
      (matches.length
        ? matches.map((s) => `<button type="button" class="store-combo-item" data-value="${escapeHtml(s[valueKey])}">${escapeHtml(storeLabel(s.number, s.name))}</button>`).join("")
        : `<div class="store-combo-empty">${escapeHtml(t("noMatchingStores"))}</div>`);
    listEl.hidden = false;

    listEl.querySelectorAll("[data-value]").forEach((btn) => {
      btn.addEventListener("click", () => select(stores.find((st) => String(st[valueKey]) === btn.dataset.value)));
    });
    const allBtn = listEl.querySelector("[data-all]");
    if (allBtn) allBtn.addEventListener("click", () => select(null));
  }

  inputEl.addEventListener("focus", () => renderList(inputEl.value));
  inputEl.addEventListener("input", () => {
    hiddenEl.value = "";
    renderList(inputEl.value);
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const matches = currentMatches(inputEl.value);
    if (matches.length === 1) select(matches[0]);
  });
  document.addEventListener("click", (e) => {
    if (!inputEl.parentElement.contains(e.target)) listEl.hidden = true;
  });
}

// A free-text version of the store combo above: no canonical list to
// select from, just autocomplete suggestions drawn from names already
// seen (recordKnownNames), and the typed text itself is the filter —
// onChange fires on every keystroke so results can filter live, with no
// Firestore round-trip (the name filter is applied client-side against
// whatever's already been fetched).
function wireNameCombo({ inputEl, listEl, getNames, onChange }) {
  if (!inputEl || !listEl) return;

  function renderList() {
    const q = inputEl.value.trim().toLowerCase();
    const names = [...getNames()]
      .filter((n) => n.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20);
    if (names.length === 0) {
      listEl.hidden = true;
      return;
    }
    listEl.innerHTML = names.map((n) => `<button type="button" class="store-combo-item" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("");
    listEl.hidden = false;
    listEl.querySelectorAll("[data-name]").forEach((btn) => {
      btn.addEventListener("click", () => {
        inputEl.value = btn.dataset.name;
        listEl.hidden = true;
        onChange();
      });
    });
  }

  inputEl.addEventListener("focus", renderList);
  inputEl.addEventListener("input", () => {
    renderList();
    onChange();
  });
  document.addEventListener("click", (e) => {
    if (!inputEl.parentElement.contains(e.target)) listEl.hidden = true;
  });
}

function todayDateString() {
  const d = nowInBusinessTZ();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(getLang() === "es" ? "es-US" : "en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIMEZONE,
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function topBarHtml() {
  return `
    <div class="top-bar">
      <h1>${escapeHtml(t("adminLink"))}</h1>
      <a class="text-link" href="#/">${t("backToChecklist")}</a>
      <div class="lang-toggle">
        <button data-lang="en" class="${getLang() === "en" ? "active" : ""}">EN</button>
        <button data-lang="es" class="${getLang() === "es" ? "active" : ""}">ES</button>
      </div>
    </div>`;
}

function wireLangToggle(rerender) {
  root.querySelectorAll(".lang-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      rerender();
    });
  });
}

// Toggles a password-type input between masked and plain text — shared
// by every real account-password field (login, signup, the
// username-account creation form in Manage Admins). Not used for PIN
// inputs, which stay masked; a PIN isn't an account credential the same
// way, and toggling it wasn't asked for.
function wirePasswordToggle(container, inputId, btnId) {
  const input = container.querySelector(`#${inputId}`);
  const btn = container.querySelector(`#${btnId}`);
  if (!input || !btn) return;
  btn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? t("showPasswordLabel") : t("hidePasswordLabel");
  });
}

// ---------- Auth screens ----------

async function handleAuthChange(user) {
  if (!user || !user.email) {
    currentUserEmail = null;
    pinUnlockedThisLoad = false;
    pinFailedAttempts = 0;
    renderLoginScreen("login", pendingLoginMessage, Boolean(pendingLoginMessage));
    pendingLoginMessage = null;
    return;
  }
  currentUserEmail = user.email;
  isOwnerSession = user.email === OWNER_EMAIL;
  // A fresh sign-in transition (this fires once per actual auth change,
  // not on every re-render) — reset to Today's Status regardless of
  // whatever tab happened to be showing before, since `activeTab` is a
  // single shared variable that otherwise carries over even when a
  // different person logs in within the same already-open tab (it was
  // only ever reset by a full page reload, which doesn't happen here).
  activeTab = "today";
  if (!isOwnerSession) {
    let adminDoc;
    try {
      adminDoc = await withTimeout(getDoc(doc(db, "admins", user.email)));
    } catch (err) {
      renderAuthCheckErrorScreen();
      return;
    }
    if (!adminDoc.exists()) {
      renderNotAdminScreen();
      return;
    }
  }
  ensureStoresSubscription();
  ensureChecklistSubscription();
  ensureAiFlagsSubscription();
  ensureAutoDateRefresh();
  const pinRecord = loadPinRecord();
  if (pinRecord && pinRecord.email === user.email && !pinUnlockedThisLoad) {
    renderPinLockScreen();
    return;
  }
  renderDashboard();
}

// A tab left open across a midnight (or Sunday) boundary otherwise keeps
// showing whatever day/week it loaded with until someone happens to
// click something — this polls the business-timezone date and
// re-renders the current tab the moment it rolls over, so Today's
// Status and Weekly Summary flip on their own, without a manual reload.
function ensureAutoDateRefresh() {
  if (autoDateRefreshStarted) return;
  autoDateRefreshStarted = true;
  lastKnownDate = todayDateString();
  setInterval(() => {
    const current = todayDateString();
    if (current !== lastKnownDate) {
      lastKnownDate = current;
      refreshCurrentTab();
    }
  }, 60000);
}

// A blocked or very slow network (store wifi filtering Google's auth
// endpoints, a dead connection, etc.) can leave a Firebase Auth call
// pending indefinitely — with no built-in timeout, the button is stuck
// on "Loading..." forever with no way to know why. This bounds any
// such call so the UI always recovers with a clear message instead.
function withTimeout(promise, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function friendlySignUpError(err) {
  if (err.code === "auth/email-already-in-use") return t("emailAlreadyInUse");
  return err.message;
}

function renderLoginScreen(mode, message, messageIsError = true) {
  const isSignUp = mode === "signup";
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card" style="max-width:360px; margin:40px auto;">
        ${isSignUp ? `<h2 style="margin-top:0;">${t("signUpTitle")}</h2>` : ""}
        ${message ? `<div class="hint-banner" ${messageIsError ? 'style="color:var(--danger); border-color:var(--danger);"' : ""}>${escapeHtml(message)}</div>` : ""}
        <form id="login-form">
          <div class="field">
            <label>${isSignUp ? t("emailLabel") : t("emailOrUsernameLabel")}</label>
            <input type="${isSignUp ? "email" : "text"}" id="login-email" name="email" autocomplete="username" required />
          </div>
          <div class="field">
            <label>${t("passwordLabel")}</label>
            <div class="password-field-wrap">
              <input type="password" id="login-password" name="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" required />
              <button type="button" class="password-toggle-btn" id="btn-toggle-login-password">${t("showPasswordLabel")}</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btn-submit-auth">${isSignUp ? t("signUpButton") : t("loginButton")}</button>
          <button type="button" class="text-link" id="btn-toggle-mode" style="display:block; margin:10px auto 0;">${isSignUp ? t("switchToLogin") : t("switchToSignUp")}</button>
          ${!isSignUp ? `<button type="button" class="text-link" id="btn-forgot-password" style="display:block; margin:4px auto 0;">${t("forgotPassword")}</button>` : ""}
        </form>
      </div>
    </main>
  `;
  wireLangToggle(() => renderLoginScreen(mode, message, messageIsError));
  wirePasswordToggle(root, "login-password", "btn-toggle-login-password");
  root.querySelector("#btn-toggle-mode").addEventListener("click", () => renderLoginScreen(isSignUp ? "login" : "signup"));
  // A real <form> with a type="submit" button (rather than a bare button
  // wired only via a click listener) is what lets Safari's Keychain
  // reliably offer to save this password and refill it with Face ID/Touch
  // ID next time — the previous floating-inputs markup made that
  // unreliable. It also gets Enter-to-submit on the password field for
  // free.
  root.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = root.querySelector("#login-email").value.trim().toLowerCase();
    const password = root.querySelector("#login-password").value;
    const btn = root.querySelector("#btn-submit-auth");
    btn.disabled = true;
    btn.textContent = t("loadingButton");
    try {
      await persistenceReady;
      if (isSignUp) {
        await withTimeout(createUserWithEmailAndPassword(auth, identifier, password));
      } else {
        // No "@" means this is a username, not an email — resolve it to
        // the real (owner-provisioned, never-seen) account email first.
        let email = identifier;
        if (!email.includes("@")) {
          const usernameDoc = await withTimeout(getDoc(doc(db, "usernames", normalizeUsername(identifier))));
          if (!usernameDoc.exists()) throw new Error("no-such-user");
          email = usernameDoc.data().email;
        }
        await withTimeout(signInWithEmailAndPassword(auth, email, password));
      }
      // Just proved identity with the real password — stronger than the
      // PIN gate, so don't immediately re-prompt for a PIN too.
      pinUnlockedThisLoad = true;
    } catch (err) {
      if (err.message === "timeout") {
        renderLoginScreen(mode, t("requestTimedOut"));
      } else {
        renderLoginScreen(mode, isSignUp ? friendlySignUpError(err) : t("loginError"));
      }
    }
  });
  const forgotBtn = root.querySelector("#btn-forgot-password");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
      const email = root.querySelector("#login-email").value.trim().toLowerCase();
      if (!email) {
        renderLoginScreen(mode, t("forgotPasswordNeedsEmail"));
        return;
      }
      if (!email.includes("@")) {
        renderLoginScreen(mode, t("forgotPasswordUsernameAccount"));
        return;
      }
      try {
        await withTimeout(sendPasswordResetEmail(auth, email));
      } catch (err) {
        // A real timeout is worth surfacing; anything else (including
        // "no such account") stays silent so existence isn't revealed.
        if (err.message === "timeout") {
          renderLoginScreen(mode, t("requestTimedOut"));
          return;
        }
      }
      renderLoginScreen(mode, t("passwordResetSent", { email }), false);
    });
  }
}

const PIN_MAX_ATTEMPTS = 5;

// Shown instead of the dashboard when this device already has a PIN set
// up for the signed-in email and it hasn't been entered yet this page
// load. Purely a local gate in front of the Firebase session that's
// already valid — never itself a credential, so there's nothing here
// worth attacking beyond what an unlocked, already-signed-in device
// already exposes without any PIN at all.
function renderPinLockScreen() {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card" style="max-width:360px; margin:40px auto; text-align:center;">
        <h2 style="margin-top:0;">${t("pinLockTitle")}</h2>
        <p style="color:var(--text-muted);">${t("pinLockSubtitle", { email: currentUserEmail })}</p>
        <form id="pin-lock-form">
          <div class="field">
            <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pin-lock-input" autocomplete="off" style="text-align:center; font-size:28px; letter-spacing:12px;" />
          </div>
          <div class="hint-banner" id="pin-lock-error" style="color:var(--danger); border-color:var(--danger);" hidden></div>
          <button type="submit" class="btn btn-primary btn-block" id="btn-pin-submit">${t("loginButton")}</button>
        </form>
        <button type="button" class="text-link" id="btn-pin-use-password" style="display:block; margin:14px auto 0;">${t("useFullLoginButton")}</button>
      </div>
    </main>
  `;
  wireLangToggle(renderPinLockScreen);
  const input = root.querySelector("#pin-lock-input");
  const errorEl = root.querySelector("#pin-lock-error");
  input.focus();
  root.querySelector("#pin-lock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = input.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      errorEl.textContent = t("pinInvalidError");
      errorEl.hidden = false;
      return;
    }
    const ok = await verifyPin(pin);
    if (ok) {
      pinUnlockedThisLoad = true;
      pinFailedAttempts = 0;
      renderDashboard();
      return;
    }
    pinFailedAttempts += 1;
    if (pinFailedAttempts >= PIN_MAX_ATTEMPTS) {
      pendingLoginMessage = t("tooManyPinAttempts");
      await signOut(auth);
      return;
    }
    errorEl.textContent = t("pinIncorrectError");
    errorEl.hidden = false;
    input.value = "";
    input.focus();
  });
  root.querySelector("#btn-pin-use-password").addEventListener("click", () => signOut(auth));
}

// Add/change the device-local PIN for the signed-in admin. Never touches
// Firestore or the real password — just an entry in this browser's own
// localStorage, scoped to this email.
function renderPinSetupModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 style="margin:0;">${t("pinSetupTitle")}</h3>
        <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
      </div>
      <p style="color:var(--text-muted); margin-top:0;">${t("pinSetupBody")}</p>
      <div class="field">
        <label>${t("pinLabel")}</label>
        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pin-setup-input" autocomplete="off" />
      </div>
      <div class="field">
        <label>${t("confirmPinLabel")}</label>
        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pin-setup-confirm" autocomplete="off" />
      </div>
      <div class="hint-banner" id="pin-setup-error" style="color:var(--danger); border-color:var(--danger);" hidden></div>
      <button type="button" class="btn btn-primary btn-block" id="btn-pin-setup-save">${t("savePinButton")}</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("#btn-pin-setup-save").addEventListener("click", async () => {
    const pin = backdrop.querySelector("#pin-setup-input").value.trim();
    const confirmPin = backdrop.querySelector("#pin-setup-confirm").value.trim();
    const errorEl = backdrop.querySelector("#pin-setup-error");
    if (!/^\d{4}$/.test(pin)) {
      errorEl.textContent = t("pinInvalidError");
      errorEl.hidden = false;
      return;
    }
    if (pin !== confirmPin) {
      errorEl.textContent = t("pinMismatchError");
      errorEl.hidden = false;
      return;
    }
    await savePinForEmail(currentUserEmail, pin);
    pinUnlockedThisLoad = true;
    backdrop.remove();
    renderDashboard();
  });
}

// The admin-roster check (getDoc on /admins/{email}) runs right after
// sign-in, before anything else renders — if it hangs on a bad network,
// the screen would otherwise be stuck on the login button's "Loading…"
// state forever with no way out. This gives a dead end a way out
// (logout, then retry) instead.
function renderAuthCheckErrorScreen() {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card" style="text-align:center;">
        <p>${t("requestTimedOut")}</p>
        <button class="btn btn-secondary" id="btn-logout">${t("logoutButton")}</button>
      </div>
    </main>
  `;
  wireLangToggle(renderAuthCheckErrorScreen);
  root.querySelector("#btn-logout").addEventListener("click", () => signOut(auth));
}

function renderNotAdminScreen() {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card" style="text-align:center;">
        <p>${t("notAnAdmin")}</p>
        <button class="btn btn-secondary" id="btn-logout">${t("logoutButton")}</button>
      </div>
    </main>
  `;
  wireLangToggle(renderNotAdminScreen);
  root.querySelector("#btn-logout").addEventListener("click", () => signOut(auth));
}

// ---------- Stores cache ----------

function ensureStoresSubscription() {
  if (storesUnsub) return;
  storesUnsub = onSnapshot(query(collection(db, "stores")), (snap) => {
    // number is a string field, so Firestore's own ordering would sort it
    // lexicographically ("100" before "99") — sort numerically instead.
    storesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => Number(a.number) - Number(b.number));
    if (activeTab === "today") renderTodayTab();
    if (activeTab === "stores") renderManageStoresTab();
  });
}

// Live count of unresolved automatic temperature-photo mismatches (see
// functions/index.js), shown as a badge on the bell button in the
// account row. Queries the small denormalized `aiFlagged` collection
// (only ever contains real mismatches, not every submission) rather
// than scanning submissions directly. Only the count badge updates on
// each change — no full dashboard re-render, since this fires
// independently of whatever tab happens to be open.
function ensureAiFlagsSubscription() {
  if (aiFlagsUnsub) return;
  aiFlagsUnsub = onSnapshot(query(collection(db, "aiFlagged"), where("reviewed", "==", false)), (snap) => {
    unresolvedAiFlagsCount = snap.docs.length;
    const btn = root.querySelector("#btn-ai-flags");
    if (btn) renderAiFlagsButtonContent(btn);
  });
}

function renderAiFlagsButtonContent(btn) {
  const count = unresolvedAiFlagsCount > 99 ? "99+" : String(unresolvedAiFlagsCount);
  btn.innerHTML = `🔔${unresolvedAiFlagsCount > 0 ? `<span class="badge-count">${count}</span>` : ""}`;
}

// One flag's row inside a date/store group -- no store or date label of
// its own since both are already established by the group headers it
// lives under; just the item, its risk, who/what shift, and why it was
// flagged.
function aiFlagRowHtml(flag) {
  const item = flag.item;
  return `
  <div class="detail-row ${item.risk === "high" ? "detail-row-critical" : ""}" data-flag-row="${flag.id}">
    <div class="detail-row-main">
      <span class="detail-item-text">${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
      <span class="detail-row-badges">${repeatViolationBadgesHtml(item.risk)}</span>
    </div>
    <div class="history-card-meta">${flag.shift ? `${escapeHtml(t("shift_" + flag.shift))} · ` : ""}${escapeHtml(flag.conductedBy)}</div>
    ${flagReasonDetailHtml(flag)}
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button type="button" class="btn btn-sm btn-secondary" data-view-flag-submission="${flag.submissionId}">${t("viewDetail")}</button>
      <button type="button" class="btn btn-sm btn-secondary" data-mark-reviewed="${flag.id}">${t("markReviewedButton")}</button>
    </div>
  </div>`;
}

function formatFlagDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLang() === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" });
}

// A store's flags within one date group -- its own nested collapsible,
// keyed by date+store together (the same store can appear under several
// different dates, each expanding independently).
function aiFlagsStoreSubGroupHtml(date, group, expandedStores) {
  const key = `${date}__${group.storeNumber}`;
  const hasCritical = group.flags.some((f) => f.item.risk === "high");
  const isExpanded = expandedStores.has(key);
  return `
  <div class="section-block" style="margin-bottom:8px;">
    <button type="button" class="section-toggle ${hasCritical ? "detail-row-critical" : ""}" data-toggle-store="${key}">
      <span class="section-chevron">${isExpanded ? "▾" : "▸"}</span>
      <span class="section-name">${escapeHtml(storeLabel(group.storeNumber, group.store?.name))}</span>
      <span class="detail-row-badges">${hasCritical ? `<span class="badge badge-danger">${t("criticalLabel")}</span>` : ""}<span class="badge badge-neutral">${group.flags.length}</span></span>
    </button>
    <div class="section-body ${isExpanded ? "" : "collapsed"}" id="ai-flags-store-body-${key}">
      ${group.flags
        .sort((a, b) => (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) || (b.checkedAt?.toMillis?.() || 0) - (a.checkedAt?.toMillis?.() || 0))
        .map((flag) => aiFlagRowHtml(flag))
        .join("")}
    </div>
  </div>`;
}

// Grouped date -> store -> flags, each level collapsed to just a count
// until tapped open. A flat list of every flag (the original design) got
// genuinely overwhelming once one store had several flags piled up on
// the same day or two -- this keeps the default view to one line per
// date, with the stores under it (and each store's individual flags)
// a tap away.
function aiFlagsDateGroupsHtml(dateGroups, expandedDates, expandedStores) {
  return dateGroups
    .map((dateGroup) => {
      const hasCritical = dateGroup.flags.some((f) => f.item.risk === "high");
      const isExpanded = expandedDates.has(dateGroup.date);
      const byStore = {};
      dateGroup.flags.forEach((f) => (byStore[f.storeNumber] ||= []).push(f));
      // Stores worst-first within a date: a store with a critical flag
      // that day comes before one that doesn't, then by how many flags.
      const storeGroups = Object.entries(byStore)
        .map(([storeNumber, storeFlags]) => ({ storeNumber, store: storesCache.find((s) => s.number === storeNumber), flags: storeFlags }))
        .sort((a, b) => {
          const aHasCritical = a.flags.some((f) => f.item.risk === "high");
          const bHasCritical = b.flags.some((f) => f.item.risk === "high");
          if (aHasCritical !== bHasCritical) return aHasCritical ? -1 : 1;
          return b.flags.length - a.flags.length || Number(a.storeNumber) - Number(b.storeNumber);
        });
      return `
      <div class="section-block" style="margin-bottom:10px;">
        <button type="button" class="section-toggle ${hasCritical ? "detail-row-critical" : ""}" data-toggle-date="${dateGroup.date}">
          <span class="section-chevron">${isExpanded ? "▾" : "▸"}</span>
          <span class="section-name">${escapeHtml(formatFlagDateLabel(dateGroup.date))}</span>
          <span class="detail-row-badges">${hasCritical ? `<span class="badge badge-danger">${t("criticalLabel")}</span>` : ""}<span class="badge badge-neutral">${dateGroup.flags.length}</span></span>
        </button>
        <div class="section-body ${isExpanded ? "" : "collapsed"}" id="ai-flags-date-body-${dateGroup.date}">
          ${storeGroups.map((group) => aiFlagsStoreSubGroupHtml(dateGroup.date, group, expandedStores)).join("")}
        </div>
      </div>`;
    })
    .join("");
}

async function renderAiFlagsModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal"><div class="modal-header"><h3 style="margin:0;">${t("aiFlagsModalTitle")}</h3></div><div class="card">${t("loadingButton")}</div></div>`;
  document.body.appendChild(backdrop);

  let snap;
  try {
    snap = await withTimeout(getDocs(query(collection(db, "aiFlagged"), where("reviewed", "==", false))));
  } catch (err) {
    backdrop.querySelector(".modal").innerHTML = `
      <div class="modal-header"><h3 style="margin:0;">${t("aiFlagsModalTitle")}</h3><button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button></div>
      <div class="hint-banner">${escapeHtml(err.message === "timeout" ? t("requestTimedOut") : String(err.message || err))}</div>
    `;
    backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
    return;
  }

  // Every item carries its violation risk level -- that's the whole
  // point of this app: stores need to know how severe a finding is to
  // actually get ready for a real Ecosure/food-safety visit, not just
  // that "something" disagreed.
  const flags = snap.docs.map((d) => ({ id: d.id, ...d.data(), item: findItemDefinitionById(d.data().itemId) || { id: d.data().itemId, en: `#${d.data().itemId}`, es: `#${d.data().itemId}`, risk: "medium" } }));

  // Grouped by date, most-recent-first -- date is a chronological axis,
  // not a severity one, so (unlike stores within it) it isn't reordered
  // by risk, just labeled with a Critical badge when a day has one.
  const byDate = {};
  flags.forEach((flag) => (byDate[flag.date] ||= []).push(flag));
  const dateGroups = Object.entries(byDate)
    .map(([date, dateFlags]) => ({ date, flags: dateFlags }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const expandedDates = new Set();
  const expandedStores = new Set();

  backdrop.querySelector(".modal").innerHTML = `
    <div class="modal-header">
      <h3 style="margin:0;">${t("aiFlagsModalTitle")}</h3>
      <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
    </div>
    <div class="hint-banner">${t("aiFlagsModalHint")}</div>
    <div id="ai-flags-groups">${dateGroups.length === 0 ? `<p>${t("noAiFlags")}</p>` : aiFlagsDateGroupsHtml(dateGroups, expandedDates, expandedStores)}</div>
  `;

  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      return;
    }
    const dateToggle = e.target.closest("[data-toggle-date]");
    if (dateToggle) {
      const date = dateToggle.dataset.toggleDate;
      if (expandedDates.has(date)) expandedDates.delete(date);
      else expandedDates.add(date);
      backdrop.querySelector(`#ai-flags-date-body-${date}`)?.classList.toggle("collapsed");
      dateToggle.querySelector(".section-chevron").textContent = expandedDates.has(date) ? "▾" : "▸";
      return;
    }
    const storeToggle = e.target.closest("[data-toggle-store]");
    if (storeToggle) {
      const key = storeToggle.dataset.toggleStore;
      if (expandedStores.has(key)) expandedStores.delete(key);
      else expandedStores.add(key);
      backdrop.querySelector(`#ai-flags-store-body-${key}`)?.classList.toggle("collapsed");
      storeToggle.querySelector(".section-chevron").textContent = expandedStores.has(key) ? "▾" : "▸";
    }
  });

  wireAiFlagActionButtons(backdrop, flags, dateGroups, expandedDates, expandedStores);
}

// (Re-)wires the View/Mark Reviewed buttons currently in the DOM -- split
// out from renderAiFlagsModal so it can be re-run after a Mark Reviewed
// re-renders the (now smaller) group list without losing scroll position
// on the whole modal. Mark Reviewed removes the flag from its date's
// group (collapsing an empty date, or an empty store within it, out of
// the list entirely) and re-renders just the groups container, carrying
// over which dates/stores were expanded so clearing several flags in a
// row doesn't collapse everything back after each one -- and re-renders
// the count badges so they stay accurate instead of drifting from what's
// actually still unresolved.
function wireAiFlagActionButtons(backdrop, flags, dateGroups, expandedDates, expandedStores) {
  backdrop.querySelectorAll("[data-mark-reviewed]").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const flagId = btn.dataset.markReviewed;
      btn.disabled = true;
      try {
        await withTimeout(updateDoc(doc(db, "aiFlagged", flagId), { reviewed: true }));
        const dateGroup = dateGroups.find((g) => g.flags.some((f) => f.id === flagId));
        if (dateGroup) {
          dateGroup.flags = dateGroup.flags.filter((f) => f.id !== flagId);
          if (dateGroup.flags.length === 0) dateGroups.splice(dateGroups.indexOf(dateGroup), 1);
        }
        const container = backdrop.querySelector("#ai-flags-groups");
        container.innerHTML = dateGroups.length === 0 ? `<p>${t("noAiFlags")}</p>` : aiFlagsDateGroupsHtml(dateGroups, expandedDates, expandedStores);
        wireAiFlagActionButtons(backdrop, flags, dateGroups, expandedDates, expandedStores);
      } catch (err) {
        btn.disabled = false;
      }
    });
  });

  backdrop.querySelectorAll("[data-view-flag-submission]").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const submissionId = btn.dataset.viewFlagSubmission;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = t("loadingButton");
      try {
        // A submission can have more than one flagged item (e.g. items #15
        // and #16 both mismatched) -- show all of them together instead of
        // making the admin click View once per item.
        const submissionFlags = flags.filter((f) => f.submissionId === submissionId);
        const itemIds = submissionFlags.map((f) => f.itemId);
        // The submission doc (for the answer values) and each flagged
        // item's photo are independent reads -- fetch them all at once
        // instead of one after another. On a slow connection, that was
        // the difference between one round trip's worth of wait and
        // several stacked back to back.
        const [submissionSnap, photoSnaps] = await withTimeout(
          Promise.all([
            getDoc(doc(db, "submissions", submissionId)),
            Promise.all(itemIds.map((id) => getDoc(doc(db, "submissions", submissionId, "photos", id)))),
          ])
        );
        if (!submissionSnap.exists()) {
          alert(t("recordNotFound"));
          return;
        }
        const answers = { ...submissionSnap.data().answers };
        itemIds.forEach((id, i) => {
          const photoSnap = photoSnaps[i];
          if (photoSnap.exists()) answers[id] = { ...answers[id], photoUrl: photoSnap.data().dataUrl };
        });
        renderAiFlagDetailModal({ id: submissionId, ...submissionSnap.data(), answers }, submissionFlags);
      } catch (err) {
        alert(err.message === "timeout" ? t("requestTimedOut") : String(err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  });
}

// Opens just the flagged item(s) for one submission -- not the full 65+
// item checklist. Opening the whole document and scrolling down to the
// one flagged answer (then scrolling all the way back up again just to
// close) was real reported friction; this shows only what needs review.
function renderAiFlagDetailModal(record, itemFlags) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const rowsHtml = itemFlags
    .map((flag) => {
      const item = findItemDefinitionById(flag.itemId) || { id: flag.itemId, en: `#${flag.itemId}`, es: `#${flag.itemId}`, risk: "medium" };
      const a = record.answers?.[flag.itemId] || {};
      const badgeClass = a.value === "yes" ? "badge-success" : a.value === "no" ? "badge-danger" : "badge-neutral";
      const badgeLabel = a.value === "yes" ? t("yes") : a.value === "no" ? t("no") : t("na");
      return `
        <div class="detail-row ${item.risk === "high" ? "detail-row-critical" : ""}" id="detail-row-${item.id}">
          <div class="detail-row-main">
            <span class="detail-item-text">${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
            <span class="detail-row-badges">${repeatViolationBadgesHtml(item.risk)}<span class="badge ${badgeClass}">${badgeLabel}</span></span>
          </div>
          <div class="detail-row-body">
            ${a.photoUrl ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />` : ""}
            ${flagReasonDetailHtml(flag)}
            ${a.note ? `<div class="detail-note" data-translatable data-note-text="${escapeHtml(a.note)}" data-note-lang="${escapeHtml(record.language || "")}"><span class="detail-note-label">${t("noteLabel")}:</span> ${escapeHtml(a.note)}<div class="detail-note-translation" hidden></div></div>` : ""}
          </div>
        </div>`;
    })
    .join("");

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 style="margin:0;">${escapeHtml(storeLabel(record.storeNumber, record.storeName))} — ${escapeHtml(record.date)}</h3>
        <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
      </div>
      <p style="color:var(--text-muted); margin-top:0;">${t("conductedByColumn")}: ${escapeHtml(record.conductedBy)}${record.shift ? ` · ${escapeHtml(t("shift_" + record.shift))}` : ""}</p>
      ${rowsHtml}
    </div>
  `;
  document.body.appendChild(backdrop);
  translateNotesIn(backdrop);
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      return;
    }
    const thumb = e.target.closest("img[data-lightbox]");
    if (thumb) openLightbox(thumb.dataset.lightbox);
  });
}

let checklistUnsub = null;

function ensureChecklistSubscription() {
  if (checklistUnsub) return;
  checklistUnsub = onSnapshot(collection(db, "checklistOverrides"), (snap) => {
    const overridesMap = {};
    snap.forEach((d) => (overridesMap[d.id] = d.data()));
    applyChecklistOverrides(overridesMap);
    if (activeTab === "checklist") renderManageChecklistTab();
  });
}

// ---------- Dashboard shell ----------

const PRIMARY_TABS = [
  ["today", "todayStatusTitle"],
  ["weekly", "weeklySummaryTitle"],
  ["history", "historyTitle"],
];

// Grouped so the "More" dropdown reads as two kinds of things rather
// than one flat list: a report to check (Repeat Violations, alongside
// Today/Weekly/History conceptually) vs. the "Manage X" setup screens.
function secondaryTabGroups() {
  const manageTabs = [
    ["stores", "manageStoresTitle"],
    ["checklist", "manageChecklistTitle"],
  ];
  if (isOwnerSession) manageTabs.push(["admins", "manageAdminsTitle"]);
  return [
    { labelKey: "reportsSectionLabel", tabs: [["repeatViolations", "repeatViolationsTitle"], ["weeklyReport", "weeklyReportTitle"]] },
    { labelKey: "manageSectionLabel", tabs: manageTabs },
  ];
}

function secondaryTabs() {
  return secondaryTabGroups().flatMap((g) => g.tabs);
}

function renderDashboard() {
  const isSecondaryActive = secondaryTabs().some(([key]) => key === activeTab);
  const pinRecord = loadPinRecord();
  const hasPinForCurrentUser = Boolean(pinRecord && pinRecord.email === currentUserEmail);
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="admin-account-row">
        <button type="button" class="btn btn-sm btn-secondary ai-flags-btn" id="btn-ai-flags" aria-label="${t("aiFlagsButtonLabel")}"></button>
        <div class="dropdown-wrap">
          <button type="button" class="btn btn-sm btn-secondary" id="btn-account-menu">⚙ ${t("accountMenuLabel")}</button>
          <div class="dropdown-menu" id="account-dropdown" hidden>
            <button type="button" class="dropdown-item" id="btn-reset-password">${t("resetPasswordButton")}</button>
            <button type="button" class="dropdown-item" id="btn-manage-pin">${hasPinForCurrentUser ? t("changePinButton") : t("setUpPinButton")}</button>
            ${hasPinForCurrentUser ? `<button type="button" class="dropdown-item" id="btn-remove-pin">${t("removePinButton")}</button>` : ""}
            <button type="button" class="dropdown-item" id="btn-logout">${t("logoutButton")}</button>
          </div>
        </div>
      </div>
      <div id="reset-password-msg" class="hint-banner" hidden></div>
      <div class="admin-tabs-wrap">
        <div class="admin-tabs">
          ${PRIMARY_TABS.map(
            ([key, labelKey]) =>
              `<button class="btn btn-sm ${activeTab === key ? "btn-primary" : "btn-secondary"}" data-tab="${key}">${t(labelKey)}</button>`
          ).join("")}
          <button type="button" class="btn btn-sm ${isSecondaryActive ? "btn-primary" : "btn-secondary"}" id="btn-more-tabs">${t("moreTabsLabel")} ▾</button>
        </div>
        <div class="dropdown-menu" id="more-tabs-dropdown" hidden>
          ${secondaryTabGroups()
            .map(
              (group, i) => `
                ${i > 0 ? `<div class="dropdown-divider"></div>` : ""}
                <div class="dropdown-section-label">${t(group.labelKey)}</div>
                ${group.tabs
                  .map(
                    ([key, labelKey]) =>
                      `<button type="button" class="dropdown-item ${activeTab === key ? "dropdown-item-active" : ""}" data-tab="${key}">${t(labelKey)}</button>`
                  )
                  .join("")}
              `
            )
            .join("")}
        </div>
      </div>
      <div id="tab-content"></div>
    </main>
  `;
  wireLangToggle(renderDashboard);
  renderAiFlagsButtonContent(root.querySelector("#btn-ai-flags"));
  root.querySelector("#btn-ai-flags").addEventListener("click", () => renderAiFlagsModal());
  root.querySelector("#btn-logout").addEventListener("click", () => signOut(auth));
  root.querySelector("#btn-reset-password").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const msgEl = root.querySelector("#reset-password-msg");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("loadingButton");
    try {
      await withTimeout(sendPasswordResetEmail(auth, currentUserEmail));
      msgEl.textContent = t("passwordResetSent", { email: currentUserEmail });
    } catch (err) {
      msgEl.textContent = err.message === "timeout" ? t("requestTimedOut") : String(err.message || err);
    } finally {
      msgEl.hidden = false;
      btn.disabled = false;
      btn.textContent = original;
      root.querySelector("#account-dropdown").hidden = true;
    }
  });
  root.querySelector("#btn-manage-pin").addEventListener("click", () => {
    root.querySelector("#account-dropdown").hidden = true;
    renderPinSetupModal();
  });
  const removePinBtn = root.querySelector("#btn-remove-pin");
  if (removePinBtn) {
    removePinBtn.addEventListener("click", () => {
      root.querySelector("#account-dropdown").hidden = true;
      if (!confirm(t("confirmRemovePin"))) return;
      clearPinRecord();
      renderDashboard();
    });
  }

  function closeDropdowns() {
    const accountMenu = root.querySelector("#account-dropdown");
    const moreTabs = root.querySelector("#more-tabs-dropdown");
    if (accountMenu) accountMenu.hidden = true;
    if (moreTabs) moreTabs.hidden = true;
  }
  root.querySelector("#btn-account-menu").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = root.querySelector("#account-dropdown");
    const willOpen = menu.hidden;
    closeDropdowns();
    menu.hidden = !willOpen;
  });
  root.querySelector("#btn-more-tabs").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = root.querySelector("#more-tabs-dropdown");
    const willOpen = menu.hidden;
    closeDropdowns();
    menu.hidden = !willOpen;
  });
  if (closeDropdownsListener) document.removeEventListener("click", closeDropdownsListener);
  closeDropdownsListener = closeDropdowns;
  document.addEventListener("click", closeDropdownsListener);

  root.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      if (activeTab === "weekly") weeklyOffset = 0;
      if (activeTab === "repeatViolations") repeatViolationsOffset = 0;
      if (activeTab === "weeklyReport") weeklyReportOffset = 0;
      renderDashboard();
    });
  });

  if (activeTab === "today") renderTodayTab();
  else if (activeTab === "weekly") renderWeeklyTab();
  else if (activeTab === "history") renderHistoryTab();
  else if (activeTab === "checklist") renderManageChecklistTab();
  else if (activeTab === "repeatViolations") renderRepeatViolationsTab();
  else if (activeTab === "weeklyReport") renderWeeklyReportTab();
  else if (activeTab === "admins" && isOwnerSession) renderManageAdminsTab();
  else renderManageStoresTab();
}

// ---------- Today's Status ----------

// How far back to look when checking whether a currently-missing store
// has been missing on prior days too. Only queried per-store, and only
// for stores already found missing today (a small subset, usually) —
// keeps this from scanning every store's history on every Today's
// Status load, which is what made that tab slow once there was more
// than a day or two of history to look back through.
const MISSING_STREAK_WINDOW_DAYS = 14;

function addDaysToDateString(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return todayDateStringFor(new Date(y, m - 1, d + delta));
}

// Consecutive days strictly before `today` with zero shifts submitted at
// `storeNumber` — a separate, per-store range query (reuses the same
// storeNumber+date composite index History's search already needs, so
// this doesn't require provisioning a new one). Only ever called for a
// store already confirmed missing today.
async function missingStreakBeforeToday(storeNumber, today) {
  const windowStart = addDaysToDateString(today, -MISSING_STREAK_WINDOW_DAYS);
  const effectiveStart = windowStart < LAUNCH_DATE ? LAUNCH_DATE : windowStart;
  const yesterday = addDaysToDateString(today, -1);
  if (yesterday < effectiveStart) return { streak: 0, hitWindowLimit: false };

  const snap = await withTimeout(
    getDocs(query(collection(db, "submissions"), where("storeNumber", "==", storeNumber), where("date", ">=", effectiveStart), where("date", "<=", yesterday)))
  );
  const docsByDate = {};
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    (docsByDate[data.date] ||= []).push(data);
  });

  let streak = 0;
  let date = yesterday;
  while (date >= effectiveStart) {
    if (shiftsCoveredForDay(docsByDate[date] || []).doneCount !== 0) break;
    streak += 1;
    date = addDaysToDateString(date, -1);
  }
  const hitWindowLimit = streak === MISSING_STREAK_WINDOW_DAYS && effectiveStart === windowStart;
  return { streak, hitWindowLimit };
}

// Rough store-hours boundaries for each shift, in business-timezone
// 24h clock hours — used only to decide whether an unsubmitted draft
// still plausibly represents someone actively working on it right now.
// An opening-shift draft left unsubmitted is a believable "in
// progress" state before ~11am, but by evening that shift's window has
// closed — there's no going back to do the morning shift, so it should
// read as stale/missing, not as still in progress.
const SHIFT_WINDOW_END_HOUR = { opening: 11, midday: 16, closing: 24 };

function shiftWindowHasPassed(shiftKey, nowHour) {
  const endHour = SHIFT_WINDOW_END_HOUR[shiftKey];
  return endHour !== undefined && nowHour >= endHour;
}

async function renderTodayTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `<div class="card">${t("loadingButton")}</div>`;

  const today = todayDateString();
  // Just today's docs, same single-field equality query as before the
  // streak feature existed — cheap, no composite index needed.
  let snap;
  try {
    snap = await withTimeout(getDocs(query(collection(db, "submissions"), where("date", "==", today))));
  } catch (err) {
    content.innerHTML = `<div class="hint-banner">${escapeHtml(err.message === "timeout" ? t("requestTimedOut") : String(err.message || err))}</div>`;
    return;
  }

  const docsByStoreNumber = {};
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    (docsByStoreNumber[data.storeNumber] ||= []).push(data);
  });

  const coveredByStoreNumber = {};
  storesCache.forEach((s) => {
    coveredByStoreNumber[s.number] = shiftsCoveredForDay(docsByStoreNumber[s.number] || []);
  });

  const notSubmittedCount = storesCache.filter((s) => coveredByStoreNumber[s.number].doneCount === 0).length;
  const dateLocale = getLang() === "es" ? "es-US" : "en-US";
  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString(dateLocale, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const notYetLaunched = today < LAUNCH_DATE;

  const nowHour = nowInBusinessTZ().getHours();
  const rows = storesCache.map((s) => {
    const covered = coveredByStoreNumber[s.number];
    const anyInProgress = (docsByStoreNumber[s.number] || []).some((d) => !d.submitted && !shiftWindowHasPassed(d.shift, nowHour));
    const complete = covered.doneCount === 3;
    const started = covered.doneCount > 0 || anyInProgress;
    const penalize = !complete && !started && !notYetLaunched;
    // Missing first (needs the most attention), then partially started,
    // then all 3 shifts complete — store number order is kept within
    // each group rather than interleaving all three.
    const statusRank = complete ? 2 : started ? 1 : 0;
    return { s, covered, complete, started, anyInProgress, penalize, statusRank };
  });

  content.innerHTML = `
    <div class="card">
      <strong>${t("storesNotSubmittedCount", { count: notSubmittedCount, total: storesCache.length })}</strong>
      <div style="color:var(--text-muted); font-size:13px;">${todayLabel}</div>
    </div>
    <div class="admin-grid">
      ${rows
        .sort((a, b) => a.statusRank - b.statusRank || Number(a.s.number) - Number(b.s.number))
        .map(({ s, covered, complete, started, anyInProgress, penalize }) => {
          const badgeClass = complete ? "badge-success" : started ? "badge-info" : penalize ? "badge-danger" : "badge-neutral";
          return `
          <div class="store-status-card ${penalize ? "missing" : ""} clickable" data-view-today="${escapeHtml(s.number)}">
            <span class="store-name">${escapeHtml(storeLabel(s.number, s.name))}</span>
            <span class="badge ${badgeClass}">${covered.doneCount} / 3</span>
            ${anyInProgress ? `<span class="badge badge-info">${t("inProgressStatus")}</span>` : ""}
          </div>`;
        })
        .join("")}
    </div>
  `;

  content.querySelectorAll("[data-view-today]").forEach((cardEl) => {
    cardEl.addEventListener("click", () => {
      const storeNumber = cardEl.dataset.viewToday;
      const store = storesCache.find((s) => s.number === storeNumber);
      renderDayShiftsModal(store, docsByStoreNumber[storeNumber] || [], coveredByStoreNumber[storeNumber]);
    });
  });

  // Only stores actually missing today ever need the historical lookback
  // — usually a handful, not the whole store list. But even a handful is
  // a handful of separate Firestore queries, and blocking the entire grid
  // behind Promise.all-ing all of them was making every admin wait out
  // the slowest one before seeing ANY store, often on a weak connection.
  // The streak label is a nice-to-have annotation, not core data, so the
  // grid above renders immediately and each label is patched in
  // independently as its own lookback resolves. Each has its own
  // try/catch: one store's lookback failing (timeout, transient error)
  // just leaves that one card without a streak label.
  rows
    .filter((r) => r.penalize)
    .forEach(async (r) => {
      let streak, hitWindowLimit;
      try {
        ({ streak, hitWindowLimit } = await missingStreakBeforeToday(r.s.number, today));
      } catch (err) {
        console.error(err);
        return;
      }
      const totalDays = streak + 1;
      if (totalDays < 2) return;
      const label = t(hitWindowLimit ? "missingStreakCapped" : "missingStreakDays", { days: totalDays });
      const card = content.querySelector(`[data-view-today="${CSS.escape(String(r.s.number))}"]`);
      if (card && !card.querySelector(".store-status-streak")) {
        card.insertAdjacentHTML("beforeend", `<span class="store-status-streak">${escapeHtml(label)}</span>`);
      }
    });
}

// Drill-down from a store's "X / 3" card on Today's Status: shows each of
// the 3 shifts' status for today (or, for a legacy pre-shift-feature
// submission, the single day-covering submission it came from) with a
// way to open the full detail for any that were actually submitted.
function renderDayShiftsModal(store, docs, covered, date = todayDateString()) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const bodyHtml = covered.legacy
    ? `
      <div class="detail-row">
        <div class="detail-row-main">
          <span class="detail-item-text">${escapeHtml(t("submittedStatus"))} · ${escapeHtml(covered.opening.conductedBy)}</span>
          <button class="btn btn-sm btn-secondary" data-view-shift-doc="${covered.opening.id}">${t("viewDetail")}</button>
        </div>
      </div>`
    : SHIFTS.map((shiftKey) => {
        const submittedDoc = covered[shiftKey];
        const inProgressDoc = docs.find((d) => d.id === shiftDocId(store.number, date, shiftKey) && !d.submitted);
        const activeDoc = submittedDoc || inProgressDoc;
        const badgeClass = submittedDoc ? "badge-success" : inProgressDoc ? "badge-info" : "badge-neutral";
        const badgeLabel = submittedDoc ? t("submittedStatus") : inProgressDoc ? t("inProgressStatus") : t("missingStatus");
        return `
        <div class="detail-row">
          <div class="detail-row-main">
            <span class="detail-item-text">${escapeHtml(t("shift_" + shiftKey))}${activeDoc ? ` · ${escapeHtml(activeDoc.conductedBy)}` : ""}</span>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>
          ${submittedDoc ? `<div class="detail-row-body"><button class="btn btn-sm btn-secondary" data-view-shift-doc="${submittedDoc.id}">${t("viewDetail")}</button></div>` : ""}
        </div>`;
      }).join("");

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 style="margin:0;">${escapeHtml(storeLabel(store.number, store.name))} — ${escapeHtml(date)}</h3>
        <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
      </div>
      ${bodyHtml}
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", async (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      return;
    }
    const viewBtn = e.target.closest("[data-view-shift-doc]");
    if (!viewBtn) return;
    const record = docs.find((d) => d.id === viewBtn.dataset.viewShiftDoc);
    if (!record) return;
    const hydrated = await hydrateRecordPhotos(record);
    backdrop.remove();
    renderDetailModal(hydrated, { expandFlagged: true });
  });
}

// ---------- Repeat Violations ----------

// Flags the same checklist item as a repeat violation once it's been
// marked "no" 2+ times for a store within the selected calendar week —
// reuses the same Sun-Sat week windows as Weekly Summary so "this week"
// means the same thing across tabs.
const REPEAT_VIOLATION_THRESHOLD = 2;
const RISK_SORT_RANK = { high: 0, medium: 1, low: 2 };

// Unlike riskBadgeHtml (which hides low-risk entries elsewhere in the
// app, since most flagged-item views are already risk-sorted and don't
// need every row labeled), a repeat violation should always show its
// risk tier — and a high-risk repeat is flagged as critical so it can't
// be mistaken for a routine one.
function repeatViolationBadgesHtml(risk) {
  if (risk === "high") return `<span class="badge badge-danger">${t("riskHigh")}</span><span class="badge badge-danger">${t("criticalLabel")}</span>`;
  if (risk === "medium") return `<span class="badge badge-warning">${t("riskMedium")}</span>`;
  return `<span class="badge badge-neutral">${t("riskLow")}</span>`;
}

// One badge per automatic check "reason" a submission's photo can be
// flagged for. `mismatch` (currently the only one actually written by
// the Cloud Function) is the reading-vs-answer disagreement; `duplicate`
// and `unreadable` are shown here so the UI is ready for those checks
// once they're built, but nothing writes those reasons yet.
// "Same day" alone isn't precise enough when the original and the
// duplicate were submitted hours apart but happen to land on the same
// business date -- prefer the exact submitted time whenever it's on
// record, and only fall back to the bare date for older flags/legacy
// submissions that never captured one.
function duplicateWhenLabel(flag) {
  return flag.duplicateOfSubmittedAt ? formatDateTime(flag.duplicateOfSubmittedAt) : flag.duplicateOfDate;
}

// Same "prefer the exact moment over just the date" logic as
// duplicateWhenLabel above, but for a wrong-photo flag's EARLIER
// wrong-photo occurrence at the same store+item (a different photo file
// each time is fine -- see functions/check-wrong-photo-repeat.js).
function priorWrongPhotoWhenLabel(flag) {
  return flag.priorWrongPhotoSubmittedAt ? formatDateTime(flag.priorWrongPhotoSubmittedAt) : flag.priorWrongPhotoDate;
}

function wrongPhotoRepeatDetailHtml(flag) {
  if (!flag.priorWrongPhotoDate) return "";
  const when = priorWrongPhotoWhenLabel(flag);
  return `<div>${escapeHtml(
    flag.priorWrongPhotoShift
      ? t("aiFlagWrongPhotoRepeatWithShift", { shift: t("shift_" + flag.priorWrongPhotoShift), date: when })
      : t("aiFlagWrongPhotoRepeat", { date: when })
  )}</div>`;
}

function aiFlagBadgeHtml(aiFlag) {
  if (!aiFlag) return "";
  const reason = aiFlag.reason || (aiFlag.mismatch ? "mismatch" : null);
  if (reason === "duplicate") {
    const when = duplicateWhenLabel(aiFlag);
    const detail = aiFlag.duplicateOfShift
      ? t("aiFlagDuplicateDetailWithShift", { shift: t("shift_" + aiFlag.duplicateOfShift), date: when })
      : t("aiFlagDuplicateDetail", { date: when });
    return `<span class="badge badge-warning" title="${escapeHtml(detail)}">${escapeHtml(t("aiFlagReasonDuplicate", { date: when }))}</span>`;
  }
  if (reason === "unreadable") {
    return `<span class="badge badge-warning" title="${escapeHtml(t("aiFlagUnreadableDetail"))}">${escapeHtml(t("aiFlagReasonUnreadable"))}</span>`;
  }
  if (reason === "wrongPhoto") {
    const when = aiFlag.priorWrongPhotoDate ? priorWrongPhotoWhenLabel(aiFlag) : null;
    const title = when
      ? `${t("aiFlagWrongPhotoDetail")} ${aiFlag.priorWrongPhotoShift ? t("aiFlagWrongPhotoRepeatWithShift", { shift: t("shift_" + aiFlag.priorWrongPhotoShift), date: when }) : t("aiFlagWrongPhotoRepeat", { date: when })}`
      : t("aiFlagWrongPhotoDetail");
    return `<span class="badge badge-warning" title="${escapeHtml(title)}">${escapeHtml(t("aiFlagReasonWrongPhoto"))}</span>`;
  }
  if (reason === "mismatch") {
    return `<span class="badge badge-warning" title="${escapeHtml(t("aiFlagsModalHint"))}">${escapeHtml(t("aiMismatchBadge", { temp: aiFlag.temperatureF }))}</span>`;
  }
  return "";
}

// Shared between the Flagged Photos list and its per-item detail view --
// the longer explanation of *why* a photo was flagged (the reading vs.
// what was expected, a duplicate's original date, or "couldn't read this").
function flagReasonDetailHtml(flag) {
  const reason = flag.reason || "mismatch";
  if (reason === "duplicate") {
    // Naming only the date reads as nonsensical when it's the SAME date
    // as this submission itself (a different shift earlier that day
    // reused the photo) -- name the original's shift too whenever it's
    // known, so it's clear this refers to a different submission.
    const when = duplicateWhenLabel(flag);
    return `<div>${escapeHtml(
      flag.duplicateOfShift
        ? t("aiFlagDuplicateDetailWithShift", { shift: t("shift_" + flag.duplicateOfShift), date: when })
        : t("aiFlagDuplicateDetail", { date: when })
    )}</div>`;
  }
  if (reason === "unreadable") return `<div>${escapeHtml(t("aiFlagUnreadableDetail"))}</div>`;
  if (reason === "wrongPhoto") return `<div>${escapeHtml(t("aiFlagWrongPhotoDetail"))}</div>${wrongPhotoRepeatDetailHtml(flag)}`;
  return `<div>${escapeHtml(t("aiFlagReadingLabel", { temp: flag.temperatureF }))} (${escapeHtml(t("aiFlagExpectedLabel", { op: flag.expectedOp, threshold: flag.expectedThreshold }))})</div>
          <div>${escapeHtml(t("aiFlagAnsweredLabel", { answer: flag.associateAnswer === "yes" ? t("yes") : t("no") }))}</div>`;
}

// storeNumber -> itemId -> { item, count, dates: [] } -- how many times
// each item was flagged "no" at each store, across a set of submission
// docs. Shared between the Repeat Violations tab (per-store threshold)
// and the Weekly Report (which also needs the cross-store view of the
// same counts), so the counting logic only lives in one place.
function buildItemNoCounts(submissionDataList) {
  const byStore = {};
  submissionDataList.forEach((data) => {
    if (!data.submitted) return;
    const bucket = (byStore[data.storeNumber] ||= {});
    for (const id of Object.keys(data.answers || {})) {
      const a = data.answers[id];
      if (a?.value !== "no") continue;
      const item = findItemDefinitionById(id) || { id, en: `#${id}`, es: `#${id}`, category: "other", risk: "medium" };
      const entry = (bucket[id] ||= { item, count: 0, dates: [] });
      entry.count += 1;
      entry.dates.push(data.date);
    }
  });
  return byStore;
}

async function renderRepeatViolationsTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `<div class="card">${t("loadingButton")}</div>`;

  const { from, to } = weekRangeDates(repeatViolationsOffset);
  let snap;
  try {
    snap = await withTimeout(getDocs(query(collection(db, "submissions"), where("date", ">=", from), where("date", "<=", to))));
  } catch (err) {
    content.innerHTML = `<div class="hint-banner">${escapeHtml(err.message === "timeout" ? t("requestTimedOut") : String(err.message || err))}</div>`;
    return;
  }

  const byStore = buildItemNoCounts(snap.docs.map((d) => d.data()));

  const storeRows = storesCache
    .map((s) => {
      const items = Object.values(byStore[s.number] || {}).filter((e) => e.count >= REPEAT_VIOLATION_THRESHOLD);
      items.sort((a, b) => (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) || b.count - a.count);
      return { store: s, items };
    })
    .filter((r) => r.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length || Number(a.store.number) - Number(b.store.number));

  const lang = getLang();
  content.innerHTML = `
    <div class="card">
      <div class="week-nav-row">
        <button class="btn btn-sm btn-secondary" id="btn-repeat-week-prev">${t("previousWeek")}</button>
        <div class="week-center"><span class="week-range-label">${escapeHtml(formatWeekRangeLabel(from, to))}</span></div>
        <button class="btn btn-sm btn-secondary" id="btn-repeat-week-next" ${repeatViolationsOffset === 0 ? "disabled" : ""}>${t("nextWeek")}</button>
      </div>
    </div>
    <div class="card">
      <strong>${storeRows.length > 0 ? t("repeatViolationsCount", { count: storeRows.length, total: storesCache.length }) : t("noRepeatViolations")}</strong>
    </div>
    ${storeRows
      .map(
        ({ store, items }) => `
      <div class="card">
        <div class="detail-section-title" style="margin-top:0;">${escapeHtml(storeLabel(store.number, store.name))}</div>
        ${items
          .map(
            (entry) => `
          <div class="detail-row ${entry.item.risk === "high" ? "detail-row-critical" : ""}">
            <div class="detail-row-main">
              <span class="detail-item-text">${!String(entry.item.id).startsWith("custom-") ? `${entry.item.id}. ` : ""}${escapeHtml(tf(entry.item))}</span>
              <span class="detail-row-badges">${repeatViolationBadgesHtml(entry.item.risk)}<span class="badge badge-neutral">${entry.count}×</span></span>
            </div>
            <div class="history-card-meta">${escapeHtml(categoryLabel(entry.item.category, lang))} · ${entry.dates.map((dt) => escapeHtml(dt)).join(", ")}</div>
          </div>`
          )
          .join("")}
      </div>`
      )
      .join("")}
  `;

  content.querySelector("#btn-repeat-week-prev").addEventListener("click", () => {
    repeatViolationsOffset += 1;
    renderRepeatViolationsTab();
  });
  content.querySelector("#btn-repeat-week-next").addEventListener("click", () => {
    if (repeatViolationsOffset === 0) return;
    repeatViolationsOffset -= 1;
    renderRepeatViolationsTab();
  });
}

// ---------- Weekly Report ----------

// A single printable page covering the whole week at once: store
// completion, cross-store trending violations, repeat violations by
// store, every flagged item, and the automated photo flags -- everything
// that currently requires visiting four separate tabs, laid out for
// "Print" -> "Save as PDF" to produce a real end-of-week document.
// Deliberately text-only (no embedded photos) to stay concise and
// printable; anything needing a closer look is still one click away in
// History.
const AI_FLAG_REASON_SECTION_KEYS = {
  mismatch: "weeklyReportMismatchSectionLabel",
  duplicate: "weeklyReportDuplicateSectionLabel",
  wrongPhoto: "weeklyReportWrongPhotoSectionLabel",
  unreadable: "weeklyReportUnreadableSectionLabel",
};
const AI_FLAG_REASON_ORDER = ["mismatch", "duplicate", "wrongPhoto", "unreadable"];

async function renderWeeklyReportTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `<div class="card">${t("loadingButton")}</div>`;

  const { from, to } = weekRangeDates(weeklyReportOffset);
  let submissionsSnap, aiFlagsSnap;
  try {
    [submissionsSnap, aiFlagsSnap] = await withTimeout(
      Promise.all([
        getDocs(query(collection(db, "submissions"), where("date", ">=", from), where("date", "<=", to))),
        getDocs(query(collection(db, "aiFlagged"), where("date", ">=", from), where("date", "<=", to))),
      ])
    );
  } catch (err) {
    content.innerHTML = `<div class="hint-banner">${escapeHtml(err.message === "timeout" ? t("requestTimedOut") : String(err.message || err))}</div>`;
    return;
  }

  // Independent of the week being navigated above -- lists every
  // auto-generated slide deck so far, not just the currently viewed week.
  // Kept in its own try/catch so a hiccup here (network, first-ever run
  // with the collection still empty, etc.) never blanks the rest of the
  // report the admin actually came here to read.
  let decks = [];
  try {
    const decksSnap = await withTimeout(getDocs(query(collection(db, "weeklyReports"), orderBy("from", "desc"), limit(12))));
    decks = decksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Failed to load weekly slide decks:", err);
  }

  const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.submitted);
  const aiFlags = aiFlagsSnap.docs.map((d) => d.data());
  const lang = getLang();

  // ---------- Store completion ----------
  const byStoreDates = {};
  submissions.forEach((s) => {
    const bucket = (byStoreDates[s.storeNumber] ||= {});
    (bucket[s.date] ||= []).push(s);
  });
  const weekDates = weekDatesList(from);
  const today = todayDateString();
  const storeCompletionRows = storesCache
    .map((store) => {
      const docsByDate = byStoreDates[store.number] || {};
      const dayStates = weekDates.map((date) => weeklyDayState(date, shiftsCoveredForDay(docsByDate[date] || []).doneCount, today));
      const doneDays = dayStates.filter((st) => st === "done").length;
      return { store, dayStates, doneDays };
    })
    .sort((a, b) => a.doneDays - b.doneDays || Number(a.store.number) - Number(b.store.number));
  const fullyCompliantCount = storeCompletionRows.filter((r) => r.doneDays === 7).length;

  // ---------- Repeat violations per store + the cross-store trending view ----------
  const byStoreItemCounts = buildItemNoCounts(submissions);
  const repeatByStoreRows = storesCache
    .map((store) => {
      const items = Object.values(byStoreItemCounts[store.number] || {}).filter((e) => e.count >= REPEAT_VIOLATION_THRESHOLD);
      items.sort((a, b) => (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) || b.count - a.count);
      return { store, items };
    })
    .filter((r) => r.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length || Number(a.store.number) - Number(b.store.number));

  // itemId -> { item, totalCount, storeEntries: [{storeNumber, count}] } --
  // the same per-store counts, re-grouped by item instead of by store, so
  // an item flagged at several DIFFERENT stores this week (a chain-wide
  // signal) shows up even when no single store hit it twice on its own.
  const crossStoreMap = {};
  for (const storeNumber of Object.keys(byStoreItemCounts)) {
    for (const [itemId, entry] of Object.entries(byStoreItemCounts[storeNumber])) {
      const bucket = (crossStoreMap[itemId] ||= { item: entry.item, totalCount: 0, storeEntries: [] });
      bucket.totalCount += entry.count;
      bucket.storeEntries.push({ storeNumber, count: entry.count });
    }
  }
  const trendingRows = Object.values(crossStoreMap)
    .filter((e) => e.storeEntries.length >= 2)
    .sort(
      (a, b) =>
        (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) ||
        b.storeEntries.length - a.storeEntries.length ||
        b.totalCount - a.totalCount
    );

  // ---------- Every flagged item, per store ----------
  const allFlaggedByStore = {};
  submissions.forEach((s) => {
    for (const id of Object.keys(s.answers || {})) {
      const a = s.answers[id];
      if (a?.value !== "no") continue;
      const item = findItemDefinitionById(id) || { id, en: `#${id}`, es: `#${id}`, category: "other", risk: "medium" };
      (allFlaggedByStore[s.storeNumber] ||= []).push({ item, date: s.date, shift: s.shift, conductedBy: s.conductedBy, note: a.note });
    }
  });
  const totalFlagged = Object.values(allFlaggedByStore).reduce((sum, rows) => sum + rows.length, 0);
  const allFlaggedRows = storesCache
    .map((store) => {
      const rows = (allFlaggedByStore[store.number] || []).sort(
        (a, b) => (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      );
      return { store, rows };
    })
    .filter((r) => r.rows.length > 0)
    .sort((a, b) => b.rows.length - a.rows.length || Number(a.store.number) - Number(b.store.number));

  // ---------- Automated photo flags, grouped by reason ----------
  const aiFlagsByReason = {};
  aiFlags.forEach((flag) => {
    const reason = flag.reason || "mismatch";
    (aiFlagsByReason[reason] ||= []).push(flag);
  });

  const hasAnyData = submissions.length > 0 || aiFlags.length > 0;

  const storeCompletionHtml = `
    <div class="card">
      <div class="detail-section-title" style="margin-top:0;">${t("weeklyReportCompletionSection")}</div>
      <div class="history-list">
        ${storeCompletionRows
          .map(
            ({ store, dayStates, doneDays }) => `
          <div class="history-card">
            <div class="history-card-top">
              <strong>${escapeHtml(storeLabel(store.number, store.name))}</strong>
              <span class="week-progress-label">${doneDays} / 7</span>
            </div>
            <div class="week-day-strip">
              ${dayStates.map((state, i) => `<div class="week-day-cell day-cell-${state}">${escapeHtml(dayLetter(weekDates[i], lang))}</div>`).join("")}
            </div>
          </div>`
          )
          .join("")}
      </div>
    </div>`;

  const trendingHtml =
    trendingRows.length === 0
      ? ""
      : `
    <div class="card">
      <div class="detail-section-title" style="margin-top:0;">${t("weeklyReportTrendingSection")}</div>
      ${trendingRows
        .map(
          (e) => `
        <div class="detail-row ${e.item.risk === "high" ? "detail-row-critical" : ""}">
          <div class="detail-row-main">
            <span class="detail-item-text">${!String(e.item.id).startsWith("custom-") ? `${e.item.id}. ` : ""}${escapeHtml(tf(e.item))}</span>
            <span class="detail-row-badges">${repeatViolationBadgesHtml(e.item.risk)}<span class="badge badge-neutral">${e.totalCount}×</span></span>
          </div>
          <div class="history-card-meta">${escapeHtml(t("weeklyReportTrendingStores", { count: e.storeEntries.length }))}: ${e.storeEntries.map((se) => escapeHtml(se.storeNumber)).join(", ")}</div>
        </div>`
        )
        .join("")}
    </div>`;

  const repeatByStoreHtml =
    repeatByStoreRows.length === 0
      ? ""
      : `
    <div class="card">
      <div class="detail-section-title" style="margin-top:0;">${t("weeklyReportRepeatSection")}</div>
      ${repeatByStoreRows
        .map(
          ({ store, items }) => `
        <div style="margin-bottom:10px;">
          <strong>${escapeHtml(storeLabel(store.number, store.name))}</strong>
          ${items
            .map(
              (entry) => `
            <div class="detail-row ${entry.item.risk === "high" ? "detail-row-critical" : ""}">
              <div class="detail-row-main">
                <span class="detail-item-text">${!String(entry.item.id).startsWith("custom-") ? `${entry.item.id}. ` : ""}${escapeHtml(tf(entry.item))}</span>
                <span class="detail-row-badges">${repeatViolationBadgesHtml(entry.item.risk)}<span class="badge badge-neutral">${entry.count}×</span></span>
              </div>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
    </div>`;

  const allFlaggedHtml =
    allFlaggedRows.length === 0
      ? ""
      : `
    <div class="card">
      <div class="detail-section-title" style="margin-top:0;">${t("weeklyReportAllFlaggedSection")}</div>
      ${allFlaggedRows
        .map(
          ({ store, rows }) => `
        <div style="margin-bottom:10px;">
          <strong>${escapeHtml(storeLabel(store.number, store.name))}</strong>
          ${rows
            .map(
              (r) => `
            <div class="detail-row ${r.item.risk === "high" ? "detail-row-critical" : ""}">
              <div class="detail-row-main">
                <span class="detail-item-text">${!String(r.item.id).startsWith("custom-") ? `${r.item.id}. ` : ""}${escapeHtml(tf(r.item))}</span>
                <span class="detail-row-badges">${repeatViolationBadgesHtml(r.item.risk)}</span>
              </div>
              <div class="history-card-meta">${escapeHtml(r.date)}${r.shift ? ` · ${escapeHtml(t("shift_" + r.shift))}` : ""} · ${escapeHtml(r.conductedBy)}${r.note ? ` — ${escapeHtml(r.note)}` : ""}</div>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
    </div>`;

  const aiFlagsHtml =
    aiFlags.length === 0
      ? ""
      : `
    <div class="card">
      <div class="detail-section-title" style="margin-top:0;">${t("weeklyReportAiFlagsSection")}</div>
      ${AI_FLAG_REASON_ORDER.filter((r) => aiFlagsByReason[r]?.length)
        .map(
          (reason) => `
        <div style="margin-bottom:10px;">
          <strong>${escapeHtml(t(AI_FLAG_REASON_SECTION_KEYS[reason]))}</strong>
          ${aiFlagsByReason[reason]
            .map((flag) => {
              const item = findItemDefinitionById(flag.itemId) || { id: flag.itemId, en: `#${flag.itemId}`, es: `#${flag.itemId}`, risk: "medium" };
              const store = storesCache.find((s) => s.number === flag.storeNumber);
              return `
            <div class="detail-row ${item.risk === "high" ? "detail-row-critical" : ""}">
              <div class="detail-row-main">
                <span class="detail-item-text">${escapeHtml(storeLabel(flag.storeNumber, store?.name))} — ${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
                <span class="detail-row-badges">${repeatViolationBadgesHtml(item.risk)}</span>
              </div>
              <div class="history-card-meta">${escapeHtml(flag.date)}${flag.shift ? ` · ${escapeHtml(t("shift_" + flag.shift))}` : ""} · ${escapeHtml(flag.conductedBy)}</div>
              ${flagReasonDetailHtml(flag)}
            </div>`;
            })
            .join("")}
        </div>`
        )
        .join("")}
    </div>`;

  const decksHtml = `
    <div class="card no-print">
      <div class="detail-section-title" style="margin-top:0;">${t("weeklyReportDecksSection")}</div>
      <div style="color:var(--text-muted); font-size:13px; margin-bottom:10px;">${escapeHtml(t("weeklyReportDecksHint"))}</div>
      ${
        decks.length === 0
          ? `<div class="hint-banner">${escapeHtml(t("weeklyReportDecksEmpty"))}</div>`
          : `<div class="history-list">
        ${decks
          .map(
            (deck) => `
          <div class="history-card">
            <div class="history-card-top">
              <strong>${escapeHtml(deck.weekLabel)}</strong>
              <button class="btn btn-sm btn-secondary btn-download-deck" data-storage-path="${escapeHtml(deck.storagePath)}" data-file-name="${escapeHtml(deck.fileName)}">${t("weeklyReportDeckDownload")}</button>
            </div>
            <div class="history-card-meta">${escapeHtml(t("weeklyReportDeckGeneratedOn", { date: formatDateTime(deck.generatedAt) }))} · ${formatFileSize(deck.fileSizeBytes)}</div>
          </div>`
          )
          .join("")}
      </div>`
      }
    </div>`;

  content.innerHTML = `
    <div class="card no-print">
      <div class="week-nav-row">
        <button class="btn btn-sm btn-secondary" id="btn-report-week-prev">${t("previousWeek")}</button>
        <div class="week-center"><span class="week-range-label">${escapeHtml(formatWeekRangeLabel(from, to))}</span></div>
        <button class="btn btn-sm btn-secondary" id="btn-report-week-next" ${weeklyReportOffset === 0 ? "disabled" : ""}>${t("nextWeek")}</button>
      </div>
      <button class="btn btn-sm btn-primary" id="btn-report-print" style="margin-top:10px; width:100%;">${t("printButton")}</button>
    </div>
    <div class="card">
      <h2 style="margin:0 0 4px;">${escapeHtml(t("weeklyReportTitle"))}</h2>
      <div style="color:var(--text-muted); font-size:13px;">${escapeHtml(formatWeekRangeLabel(from, to))}</div>
      <strong style="display:block; margin-top:8px;">${escapeHtml(
        t("weeklyReportSummaryLine", { done: fullyCompliantCount, total: storesCache.length, flagged: totalFlagged, repeat: repeatByStoreRows.reduce((sum, r) => sum + r.items.length, 0), aiFlags: aiFlags.length })
      )}</strong>
    </div>
    ${decksHtml}
    ${!hasAnyData ? `<div class="card">${t("weeklyReportNoData")}</div>` : ""}
    ${storeCompletionHtml}
    ${trendingHtml}
    ${repeatByStoreHtml}
    ${allFlaggedHtml}
    ${aiFlagsHtml}
  `;

  content.querySelector("#btn-report-week-prev").addEventListener("click", () => {
    weeklyReportOffset += 1;
    renderWeeklyReportTab();
  });
  content.querySelector("#btn-report-week-next").addEventListener("click", () => {
    if (weeklyReportOffset === 0) return;
    weeklyReportOffset -= 1;
    renderWeeklyReportTab();
  });
  content.querySelector("#btn-report-print").addEventListener("click", () => window.print());
  content.querySelectorAll(".btn-download-deck").forEach((btn) => {
    btn.addEventListener("click", () => downloadWeeklyReportDeck(btn));
  });
}

async function downloadWeeklyReportDeck(btn) {
  const storagePath = btn.dataset.storagePath;
  const fileName = btn.dataset.fileName;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = t("weeklyReportDeckDownloading");
  try {
    const bytes = await getBytes(ref(storage, storagePath));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to download weekly slide deck:", err);
    alert(t("weeklyReportDeckDownloadFailed"));
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// ---------- Weekly Summary ----------

function formatWeekRangeLabel(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lang = getLang() === "es" ? "es-US" : "en-US";
  const fromStr = new Date(fy, fm - 1, fd).toLocaleDateString(lang, { month: "short", day: "numeric" });
  const toStr = new Date(ty, tm - 1, td).toLocaleDateString(lang, { month: "short", day: "numeric", year: "numeric" });
  return `${fromStr} – ${toStr}`;
}

// The 7 calendar-date strings (Sun-Sat) covered by a week's from/to range,
// in order — used to build each store's day-by-day status strip.
function weekDatesList(from) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(todayDateStringFor(new Date(fy, fm - 1, fd + i)));
  }
  return dates;
}

// A day is only "done" once all 3 shifts (or one legacy pre-shift-feature
// submission) are submitted — but 1 or 2 of the 3 is real, in-progress
// effort and reads very differently from a day nobody touched at all, so
// this keeps a 3rd state between "done" and "missing" instead of
// collapsing both non-done cases together. A day that hasn't happened
// yet (or falls before rollout) is never held against a store.
function weeklyDayState(date, doneCount, today) {
  if (doneCount === 3) return "done";
  if (doneCount > 0) return "partial";
  if (date > today || date < LAUNCH_DATE) return "future";
  return "missing";
}

function dayLetter(dateStr, lang) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: "narrow" });
}

async function renderWeeklyTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `<div class="card">${t("loadingButton")}</div>`;

  const { from, to } = weekRangeDates(weeklyOffset);
  // Single date-range filter, no equality filter alongside it — this
  // doesn't need a composite index, unlike the per-store History search.
  const snap = await getDocs(query(collection(db, "submissions"), where("date", ">=", from), where("date", "<=", to)));

  const byStore = {};
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    const bucket = (byStore[data.storeNumber] ||= { docsByDate: {}, flagged: 0, lastSubmittedAt: null });
    if (data.submitted) {
      (bucket.docsByDate[data.date] ||= []).push(data);
      bucket.flagged += Object.values(data.answers || {}).filter((a) => a.value === "no").length;
      const ts = data.submittedAt?.toMillis ? data.submittedAt.toMillis() : 0;
      if (!bucket.lastSubmittedAt || ts > bucket.lastSubmittedAt) bucket.lastSubmittedAt = ts;
      recordKnownNames([data]);
    }
  });

  const weekDates = weekDatesList(from);
  const today = todayDateString();
  const lang = getLang() === "es" ? "es-US" : "en-US";

  const rows = storesCache
    .map((s) => {
      const b = byStore[s.number] || { docsByDate: {}, flagged: 0, lastSubmittedAt: null };
      const dayStates = weekDates.map((date) => weeklyDayState(date, shiftsCoveredForDay(b.docsByDate[date] || []).doneCount, today));
      const doneDays = dayStates.filter((st) => st === "done").length;
      return { store: s, dayStates, doneDays, flagged: b.flagged, lastSubmittedAt: b.lastSubmittedAt };
    })
    .sort((a, b) => a.doneDays - b.doneDays || b.flagged - a.flagged || Number(a.store.number) - Number(b.store.number));

  const totalPossibleDays = storesCache.length * 7;
  const totalDoneDays = rows.reduce((sum, r) => sum + r.doneDays, 0);
  const percentComplete = totalPossibleDays > 0 ? Math.round((totalDoneDays / totalPossibleDays) * 100) : 0;

  content.innerHTML = `
    <div class="card">
      <div class="week-nav-row">
        <button class="btn btn-sm btn-secondary" id="btn-week-prev">${t("previousWeek")}</button>
        <div class="week-center">
          <span class="week-range-label">${escapeHtml(formatWeekRangeLabel(from, to))}</span>
          <span class="week-percent">${percentComplete}%</span>
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-week-next" ${weeklyOffset === 0 ? "disabled" : ""}>${t("nextWeek")}</button>
      </div>
    </div>
    <div class="card">
      <div class="history-list">
        ${rows
          .map((r) => {
            const lastSub = r.lastSubmittedAt ? formatDateTime({ toDate: () => new Date(r.lastSubmittedAt) }) : t("weeklyNever");
            return `
            <div class="history-card">
              <div class="history-card-top">
                <strong>${escapeHtml(storeLabel(r.store.number, r.store.name))}</strong>
                <span class="week-progress-label">${r.doneDays} / 7</span>
              </div>
              <div class="week-day-strip">
                ${r.dayStates
                  .map((state, i) =>
                    state === "future"
                      ? `<div class="week-day-cell day-cell-${state}">${escapeHtml(dayLetter(weekDates[i], lang))}</div>`
                      : `<div class="week-day-cell day-cell-${state} clickable" data-view-weekly-day="${escapeHtml(r.store.number)}" data-view-weekly-date="${escapeHtml(weekDates[i])}">${escapeHtml(dayLetter(weekDates[i], lang))}</div>`
                  )
                  .join("")}
              </div>
              <div class="history-card-actions">
                <span class="history-card-meta" style="margin-top:0;">${escapeHtml(t("weeklyLastSubmission"))}: ${escapeHtml(lastSub)}</span>
                ${r.flagged > 0 ? `<button class="btn btn-sm btn-danger" data-view-weekly-flagged="${escapeHtml(r.store.number)}">${escapeHtml(t("weeklyFlaggedColumn"))}: ${r.flagged}</button>` : ""}
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </div>
  `;

  content.querySelector("#btn-week-prev").addEventListener("click", () => {
    weeklyOffset += 1;
    renderWeeklyTab();
  });
  content.querySelector("#btn-week-next").addEventListener("click", () => {
    if (weeklyOffset === 0) return;
    weeklyOffset -= 1;
    renderWeeklyTab();
  });

  content.querySelectorAll("[data-view-weekly-flagged]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = t("loadingButton");
      try {
        await openWeeklyFlagged(btn.dataset.viewWeeklyFlagged, from, to);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  });

  // Every submission for the week was already fetched into `byStore` to
  // build the day strips above -- no extra query needed to show what was
  // submitted on a given day, just reuse it.
  content.querySelectorAll("[data-view-weekly-day]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const storeNumber = cell.dataset.viewWeeklyDay;
      const date = cell.dataset.viewWeeklyDate;
      const store = storesCache.find((s) => s.number === storeNumber);
      const docsForDay = byStore[storeNumber]?.docsByDate[date] || [];
      renderDayShiftsModal(store, docsForDay, shiftsCoveredForDay(docsForDay), date);
    });
  });
}

// Fetches and opens the flagged-only view directly, without switching to
// the History tab — closing it should land back on Weekly Summary, not
// on a History list the admin never actually asked to browse.
async function openWeeklyFlagged(storeNumber, from, to) {
  const snap = await getDocs(
    query(
      collection(db, "submissions"),
      where("date", ">=", from),
      where("date", "<=", to),
      where("storeNumber", "==", storeNumber),
      orderBy("date", "desc")
    )
  );
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const flaggedRecords = records.filter((r) => Object.values(r.answers || {}).filter((a) => a.value === "no").length > 0);
  if (flaggedRecords.length > 0) openFlaggedOnly(flaggedRecords);
}

// ---------- History ----------

function todayDateStringFor(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// True Sun-Sat calendar weeks, anchored to the business timezone (not
// each device's own local zone) so "today"/"this week" means the same
// thing no matter where an admin happens to be. weeksAgo=0 is the
// calendar week containing today; weeksAgo=1 is the week before that,
// and so on.
function weekRangeDates(weeksAgo) {
  const now = nowInBusinessTZ();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: todayDateStringFor(start), to: todayDateStringFor(end) };
}

// "weekly" only ever applies with a single store selected — an all-
// stores weekly rollup already exists as its own tab (Weekly Summary),
// so History's Weekly view stays scoped to "check one store's past".
let histViewMode = "daily";
let expandedHistoryWeek = null;
// History is search-first: nothing loads until an admin actually
// searches (Search, or picking a store) — a browsable everything-list
// already exists on Weekly Summary, so History doesn't need to
// duplicate it.
let hasSearchedHistory = false;

function renderHistoryTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  const today = todayDateString();
  const monthAgo = nowInBusinessTZ();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const fromDefault = todayDateStringFor(monthAgo);
  const toDefault = today;
  lastHistoryResults = [];
  hasSearchedHistory = false;

  content.innerHTML = `
    <div class="card">
      <div class="field">
        <label>${t("filterStore")}</label>
        <div class="store-combo">
          <input type="text" id="hist-store-input" autocomplete="off" placeholder="${t("filterAllStores")}" />
          <input type="hidden" id="hist-store" value="" />
          <div class="store-combo-list" id="hist-store-list" hidden></div>
        </div>
      </div>
      <div class="field">
        <label>${t("filterConductedBy")}</label>
        <div class="store-combo">
          <input type="text" id="hist-name-input" autocomplete="off" placeholder="${t("filterAnyName")}" />
          <div class="store-combo-list" id="hist-name-list" hidden></div>
        </div>
      </div>
      <div class="view-mode-row" id="hist-view-mode-row" hidden>
        <button type="button" class="btn btn-sm ${histViewMode === "daily" ? "btn-primary" : "btn-secondary"}" data-view-mode="daily">${t("dailyViewLabel")}</button>
        <button type="button" class="btn btn-sm ${histViewMode === "weekly" ? "btn-primary" : "btn-secondary"}" data-view-mode="weekly">${t("weeklyViewLabel")}</button>
      </div>
      <div class="hist-date-row">
        <div class="field">
          <label>${t("filterFrom")}</label>
          <input type="date" id="hist-from" value="${fromDefault}" />
        </div>
        <div class="field">
          <label>${t("filterTo")}</label>
          <input type="date" id="hist-to" value="${toDefault}" />
        </div>
      </div>
      <div class="hist-actions-row">
        <button class="btn btn-primary" id="btn-hist-search">${t("searchButton")}</button>
        <button class="btn btn-secondary" id="btn-hist-export" disabled>${t("exportCsv")}</button>
      </div>
    </div>
    <div class="card" id="hist-results"><p style="color:var(--text-muted); margin:0;">${t("historySearchPrompt")}</p></div>
  `;

  function updateViewModeVisibility() {
    const storeNumber = content.querySelector("#hist-store").value;
    content.querySelector("#hist-view-mode-row").hidden = !storeNumber;
    if (!storeNumber) histViewMode = "daily";
  }

  wireStoreCombo({
    inputEl: content.querySelector("#hist-store-input"),
    hiddenEl: content.querySelector("#hist-store"),
    listEl: content.querySelector("#hist-store-list"),
    stores: storesCache,
    allLabel: t("filterAllStores"),
    onSelect: () => {
      // A newly picked (or cleared) store must re-query Firestore, not
      // just re-render whatever was already fetched — otherwise Weekly
      // view could silently aggregate another store's data in until
      // Search was also pressed.
      updateViewModeVisibility();
      runHistorySearch();
    },
  });
  updateViewModeVisibility();

  content.querySelectorAll("[data-view-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      histViewMode = btn.dataset.viewMode;
      expandedHistoryWeek = null;
      content.querySelectorAll("[data-view-mode]").forEach((b) => {
        b.classList.toggle("btn-primary", b.dataset.viewMode === histViewMode);
        b.classList.toggle("btn-secondary", b.dataset.viewMode !== histViewMode);
      });
      renderHistoryResults();
    });
  });

  wireNameCombo({
    inputEl: content.querySelector("#hist-name-input"),
    listEl: content.querySelector("#hist-name-list"),
    getNames: () => knownConductedByNames,
    onChange: () => renderHistoryResults(),
  });

  root.querySelector("#btn-hist-search").addEventListener("click", () => runHistorySearch());
  root.querySelector("#btn-hist-export").addEventListener("click", () => exportCsv(filteredHistoryResults()));
}

async function openHistoryRecord(record) {
  const hydrated = await hydrateRecordPhotos(record);
  renderDetailModal(hydrated);
}

async function openFlaggedOnly(records) {
  const hydrated = await Promise.all(records.map((r) => hydrateFlaggedPhotos(r)));
  renderFlaggedItemsModal(hydrated);
}

// Adds an auto-translated line under any free-text note whose recorded
// language doesn't match whatever the admin is currently viewing in —
// never replaces the original (translateText itself is a no-op when
// languages already match, or when the translation service has
// nothing better to offer). Runs after the modal is already in the DOM
// so a slow/unavailable translation never delays showing the record.
async function translateNotesIn(container) {
  const target = getLang();
  const els = [...container.querySelectorAll("[data-translatable]")];
  await Promise.all(
    els.map(async (el) => {
      const sourceLang = el.dataset.noteLang;
      if (!sourceLang || sourceLang === target) return;
      const translated = await translateText(el.dataset.noteText, sourceLang, target);
      if (!translated) return;
      const slot = el.querySelector(".detail-note-translation");
      if (!slot) return;
      slot.textContent = `🌐 ${t("translatedLabel")}: ${translated}`;
      slot.hidden = false;
    })
  );
}

// Shows only the flagged ("No") rows, across one or more submissions —
// no full 65+ item questionnaire, no landing on History first. One record
// means a single day's flags; more than one (e.g. from a week's worth of
// submissions) shows every flagged row across them, each labeled by date.
function renderFlaggedItemsModal(records) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const multi = records.length > 1;

  // Reads answer keys directly (with findItemDefinitionById for the
  // wording) rather than walking the live CHECKLIST_GROUPS, so a flagged
  // answer for a since-hidden or since-reworded question still shows up
  // here — the aggregate flagged count elsewhere already counts it too.
  const flaggedRows = [];
  for (const record of records) {
    for (const id of Object.keys(record.answers || {})) {
      const a = record.answers[id];
      if (a?.value === "no") {
        const item = findItemDefinitionById(id) || { id, en: `#${id}`, es: `#${id}`, category: "other", risk: "medium" };
        flaggedRows.push({ record, item, a });
      }
    }
  }

  // Grouped by Panda's violation-risk category (Food Storage & Labeling,
  // Food Temperatures, etc.) so the same categories from the internal
  // risk-progression reference show up here, most urgent first within
  // each group — a High-risk violation shouldn't be buried under a
  // Low-risk one just because of checklist order.
  const RISK_RANK = { high: 0, medium: 1, low: 2 };
  const lang = getLang();
  const rowsByCategory = new Map();
  for (const row of flaggedRows) {
    const catId = row.item.category || "other";
    if (!rowsByCategory.has(catId)) rowsByCategory.set(catId, []);
    rowsByCategory.get(catId).push(row);
  }
  const orderedCategoryIds = VIOLATION_CATEGORIES.map((c) => c.id).filter((id) => rowsByCategory.has(id));

  const rowsHtml = flaggedRows.length
    ? orderedCategoryIds
        .map((catId) => {
          const rows = [...rowsByCategory.get(catId)].sort((a, b) => (RISK_RANK[a.item.risk] ?? 1) - (RISK_RANK[b.item.risk] ?? 1));
          return `
            <div class="detail-section-title">${escapeHtml(categoryLabel(catId, lang))}</div>
            ${rows
              .map(
                ({ record, item, a }) => `
              <div class="detail-row detail-row-flagged ${item.risk === "high" ? "detail-row-critical" : ""}">
                <div class="detail-row-main">
                  <span class="detail-item-text">${multi ? `<span class="detail-flagged-date">${escapeHtml(record.date)}</span> — ` : ""}${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
                  <span class="detail-row-badges">${repeatViolationBadgesHtml(item.risk)}<span class="badge badge-danger">${t("no")}</span></span>
                </div>
                <div class="detail-row-body">
                  ${a.photoUrl ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />` : ""}
                  ${a.note ? `<div class="detail-note" data-translatable data-note-text="${escapeHtml(a.note)}" data-note-lang="${escapeHtml(record.language || "")}"><span class="detail-note-label">${t("noteLabel")}:</span> ${escapeHtml(a.note)}<div class="detail-note-translation" hidden></div></div>` : ""}
                </div>
              </div>`
              )
              .join("")}`;
        })
        .join("")
    : `<p>${t("noFlaggedItemsFound")}</p>`;

  const first = records[0];
  const headerLabel = multi
    ? `${escapeHtml(storeLabel(first.storeNumber, first.storeName))} — ${t("flaggedItems")}`
    : `${escapeHtml(storeLabel(first.storeNumber, first.storeName))} — ${escapeHtml(first.date)}`;

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 style="margin:0;">${headerLabel}</h3>
        <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
      </div>
      ${!multi ? `<p style="color:var(--text-muted); margin-top:0;">${t("conductedByColumn")}: ${escapeHtml(first.conductedBy)}</p>` : ""}
      ${rowsHtml}
      ${!multi ? `<button type="button" class="text-link" id="modal-delete-submission" style="color:var(--danger); margin-top:14px;">${t("deleteSubmission")}</button>` : ""}
    </div>
  `;
  document.body.appendChild(backdrop);
  translateNotesIn(backdrop);
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  const deleteBtn = backdrop.querySelector("#modal-delete-submission");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async (e) => {
      if (!confirm(t("confirmDeleteSubmission", { store: first.storeNumber, date: first.date }))) return;
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = t("loadingButton");
      await deleteSubmission(first);
      backdrop.remove();
      refreshCurrentTab();
    });
  }
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      return;
    }
    const thumb = e.target.closest("img[data-lightbox]");
    if (thumb) openLightbox(thumb.dataset.lightbox);
  });
}

async function runHistorySearch() {
  const storeInputEl = root.querySelector("#hist-store-input");
  const storeText = storeInputEl ? storeInputEl.value.trim() : "";
  let storeNumber = root.querySelector("#hist-store").value;
  if (!storeNumber && storeText) {
    // Typed a store number but didn't tap a suggestion — accept it if it
    // unambiguously matches exactly one store.
    const candidates = storesCache.filter((s) => s.number.startsWith(storeText));
    if (candidates.length === 1) storeNumber = candidates[0].number;
  }
  const from = root.querySelector("#hist-from").value;
  const to = root.querySelector("#hist-to").value;
  const resultsEl = root.querySelector("#hist-results");
  resultsEl.innerHTML = `<div>${t("loadingButton")}</div>`;

  const clauses = [where("date", ">=", from), where("date", "<=", to)];
  if (storeNumber) clauses.push(where("storeNumber", "==", storeNumber));
  let snap;
  try {
    snap = await getDocs(query(collection(db, "submissions"), ...clauses, orderBy("date", "desc"), limit(500)));
  } catch (err) {
    resultsEl.innerHTML = `<div class="hint-banner">${escapeHtml(err.message)}</div>`;
    return;
  }
  lastHistoryResults = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  recordKnownNames(lastHistoryResults);
  expandedHistoryWeek = null;
  hasSearchedHistory = true;
  const exportBtn = root.querySelector("#btn-hist-export");
  if (exportBtn) exportBtn.disabled = false;
  renderHistoryResults();
}

// Name filtering happens entirely client-side against whatever's already
// been fetched (no Firestore query re-run), so it can filter live on
// every keystroke — kept separate from lastHistoryResults itself so a
// changed name filter never needs to touch what was actually queried.
function filteredHistoryResults() {
  const q = (root.querySelector("#hist-name-input")?.value || "").trim().toLowerCase();
  if (!q) return lastHistoryResults;
  return lastHistoryResults.filter((r) => (r.conductedBy || "").toLowerCase().includes(q));
}

function renderHistoryResults() {
  const resultsEl = root.querySelector("#hist-results");
  if (!resultsEl) return;
  if (!hasSearchedHistory) {
    resultsEl.innerHTML = `<p style="color:var(--text-muted); margin:0;">${t("historySearchPrompt")}</p>`;
    return;
  }
  if (filteredHistoryResults().length === 0) {
    resultsEl.innerHTML = `<div>${t("noSubmissionsFound")}</div>`;
    return;
  }
  const storeNumber = root.querySelector("#hist-store")?.value;
  if (histViewMode === "weekly" && storeNumber) renderWeeklyHistoryView(resultsEl);
  else renderDailyHistoryView(resultsEl);
}

function historyDayCardHtml(r, dateLocale) {
  const flaggedCount = Object.values(r.answers || {}).filter((a) => a.value === "no").length;
  const dateLabel = new Date(`${r.date}T00:00:00`).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });
  return `
    <div class="history-card">
      <div class="history-card-top">
        <strong>${escapeHtml(storeLabel(r.storeNumber, r.storeName))}</strong>
        <span class="badge ${r.submitted ? "badge-success" : "badge-info"}">${r.submitted ? t("submittedStatus") : t("inProgressStatus")}</span>
      </div>
      <div class="history-card-meta">${escapeHtml(dateLabel)}${r.shift ? ` · ${escapeHtml(t("shift_" + r.shift))}` : ""} · ${escapeHtml(r.conductedBy)}</div>
      <div class="history-card-actions">
        ${flaggedCount > 0 ? `<button class="btn btn-sm btn-danger" data-view-flagged="${r.id}">${t("flaggedItems")}: ${flaggedCount}</button>` : `<span class="history-flagged-none">${t("flaggedItems")}: 0</span>`}
        <button class="btn btn-sm btn-secondary" data-view="${r.id}">${t("viewDetail")}</button>
      </div>
    </div>`;
}

function renderDailyHistoryView(resultsEl) {
  const dateLocale = getLang() === "es" ? "es-US" : "en-US";
  resultsEl.innerHTML = `<div class="history-list">${filteredHistoryResults().map((r) => historyDayCardHtml(r, dateLocale)).join("")}</div>`;
  wireHistoryResultButtons(resultsEl);
}

// Buckets records into Sun-Sat calendar weeks (matching the rest of the
// app's week boundaries), newest week first — a pure regrouping of
// whatever's already been fetched, so switching Daily/Weekly never
// re-queries Firestore.
function groupRecordsByWeek(records) {
  const weeks = new Map();
  for (const r of records) {
    const d = new Date(`${r.date}T00:00:00`);
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    const key = todayDateStringFor(start);
    if (!weeks.has(key)) {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      weeks.set(key, { from: key, to: todayDateStringFor(end), records: [] });
    }
    weeks.get(key).records.push(r);
  }
  return [...weeks.values()].sort((a, b) => (a.from < b.from ? 1 : -1));
}

function renderWeeklyHistoryView(resultsEl) {
  const dateLocale = getLang() === "es" ? "es-US" : "en-US";
  const weeks = groupRecordsByWeek(filteredHistoryResults());
  resultsEl.innerHTML = `
    <div class="history-list">
      ${weeks
        .map((w) => {
          const recordsByDate = {};
          for (const r of w.records) (recordsByDate[r.date] ||= []).push(r);
          const doneDays = Object.values(recordsByDate).filter((docsForDay) => shiftsCoveredForDay(docsForDay).doneCount === 3).length;
          const flaggedTotal = w.records.reduce(
            (sum, r) => sum + Object.values(r.answers || {}).filter((a) => a.value === "no").length,
            0
          );
          const expanded = expandedHistoryWeek === w.from;
          const sortedDays = [...w.records].sort((a, b) => (a.date < b.date ? 1 : -1));
          return `
          <div class="history-card">
            <button type="button" class="history-week-toggle" data-week="${w.from}">
              <span>${escapeHtml(formatWeekRangeLabel(w.from, w.to))}</span>
              <span class="history-week-toggle-right">
                <span class="badge ${doneDays === 7 ? "badge-success" : doneDays === 0 ? "badge-danger" : "badge-neutral"}">${doneDays} / 7</span>
                ${flaggedTotal > 0 ? `<span class="badge badge-danger">${t("flaggedItems")}: ${flaggedTotal}</span>` : ""}
                <span class="history-week-caret">${expanded ? "▲" : "▼"}</span>
              </span>
            </button>
            ${expanded ? `<div class="history-week-days">${sortedDays.map((r) => historyDayCardHtml(r, dateLocale)).join("")}</div>` : ""}
          </div>`;
        })
        .join("")}
    </div>
  `;
  resultsEl.querySelectorAll("[data-week]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.week;
      expandedHistoryWeek = expandedHistoryWeek === key ? null : key;
      renderWeeklyHistoryView(resultsEl);
    });
  });
  wireHistoryResultButtons(resultsEl);
}

function wireHistoryResultButtons(container) {
  container.querySelectorAll("button[data-view], button[data-view-flagged]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const recordId = btn.dataset.view || btn.dataset.viewFlagged;
      const record = lastHistoryResults.find((r) => r.id === recordId);
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = t("loadingButton");
      try {
        if (btn.dataset.viewFlagged) await openFlaggedOnly([record]);
        else await openHistoryRecord(record);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  });
}

// Photos live in a subcollection (submissions/{id}/photos/{itemId}), not
// on the submission doc itself — fetched lazily, only when an admin
// actually opens a detail view, so browsing the History list itself
// stays light.
async function hydrateRecordPhotos(record) {
  const photosSnap = await getDocs(collection(db, "submissions", record.id, "photos"));
  const answers = { ...record.answers };
  photosSnap.forEach((d) => {
    const id = Number(d.id);
    if (answers[id]) answers[id] = { ...answers[id], photoUrl: d.data().dataUrl };
  });
  return { ...record, answers };
}

// Same idea as hydrateRecordPhotos, but only fetches photos for items
// actually flagged ("No") on this record — used by the flagged-only view
// (openFlaggedOnly), which never shows a passed item's photo anyway. Up
// to 6 checklist items require a documentation photo even when they
// pass, so fetching the *whole* photos subcollection there was
// downloading several unused embedded images per record — the real cost
// behind Weekly's "Flagged" view (often pulling a whole week of records
// at once) being slow to open.
// extraItemIds covers an AI-flagged item, which is typically answered
// "yes" (that's the whole point of a mismatch) and so wouldn't
// otherwise be included alongside the real "no" flags.
async function hydrateFlaggedPhotos(record, extraItemIds = []) {
  const flaggedIds = new Set(Object.keys(record.answers || {}).filter((id) => record.answers[id]?.value === "no"));
  for (const id of extraItemIds) flaggedIds.add(String(id));
  const answers = { ...record.answers };
  await Promise.all(
    [...flaggedIds].map(async (id) => {
      const snap = await getDoc(doc(db, "submissions", record.id, "photos", id));
      if (snap.exists()) answers[id] = { ...answers[id], photoUrl: snap.data().dataUrl };
    })
  );
  return { ...record, answers };
}

function renderDetailModal(record, { expandFlagged = false } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  let firstFlaggedId = null;

  let sectionsHtml = "";
  const renderedItemIds = new Set();

  function renderDetailRow(item) {
    renderedItemIds.add(String(item.id));
    const a = record.answers?.[item.id] || {};
    const value = a.value || null;
    const isNo = value === "no";
    const badgeClass = value === "yes" ? "badge-success" : value === "no" ? "badge-danger" : "badge-neutral";
    const badgeLabel = value === "yes" ? t("yes") : value === "no" ? t("no") : value === "na" ? t("na") : "—";
    const proofPhoto = item.alwaysPhoto && value === "yes" && a.photoUrl;
    if (isNo && firstFlaggedId === null) firstFlaggedId = item.id;
    const aiFlag = record.aiFlags?.[item.id];
    // Every flagged item always shows its violation risk level — the
    // whole point of this app is prepping stores for a real Ecosure/
    // food-safety visit, where severity is exactly what gets graded, so
    // this can't be a sometimes-shown label. Uses the same always-show
    // (including Low) + Critical-for-High treatment as Repeat Violations.
    const itemRisk = (findItemDefinitionById(item.id) || {}).risk || "medium";
    const isCritical = isNo && itemRisk === "high";
    return `
      <div class="detail-row ${isNo ? "detail-row-flagged" : ""} ${isCritical ? "detail-row-critical" : ""}" ${isNo ? `data-toggle-detail="${item.id}"` : ""} id="detail-row-${item.id}">
        <div class="detail-row-main">
          <span class="detail-item-text">${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
          <span class="detail-row-badges">
            ${isNo ? repeatViolationBadgesHtml(itemRisk) : ""}
            ${aiFlagBadgeHtml(aiFlag)}
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </span>
        </div>
        ${
          isNo
            ? `<div class="detail-row-body ${expandFlagged ? "" : "collapsed"}" id="detail-body-${item.id}">
                ${a.photoUrl ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />` : ""}
                ${a.note ? `<div class="detail-note" data-translatable data-note-text="${escapeHtml(a.note)}" data-note-lang="${escapeHtml(record.language || "")}"><span class="detail-note-label">${t("noteLabel")}:</span> ${escapeHtml(a.note)}<div class="detail-note-translation" hidden></div></div>` : ""}
              </div>`
            : proofPhoto
              ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />`
              : ""
        }
      </div>`;
  }

  for (const group of CHECKLIST_GROUPS) {
    for (const section of group.sections) {
      sectionsHtml += `<div class="detail-section-title">${escapeHtml(tf(section))}</div>`;
      for (const item of section.items) {
        sectionsHtml += renderDetailRow(item);
      }
    }
  }

  // A question hidden or reworded *after* this submission was recorded
  // still has its answer in Firestore — show it in its own section
  // rather than silently dropping historical data.
  const leftoverIds = Object.keys(record.answers || {}).filter((id) => !renderedItemIds.has(String(id)));
  if (leftoverIds.length > 0) {
    sectionsHtml += `<div class="detail-section-title">${t("retiredQuestionsTitle")}</div>`;
    for (const id of leftoverIds) {
      const item = findItemDefinitionById(id) || { id, en: `#${id}`, es: `#${id}` };
      sectionsHtml += renderDetailRow(item);
    }
  }

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 style="margin:0;">${escapeHtml(record.storeNumber)} — ${escapeHtml(record.date)}</h3>
        <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
      </div>
      <div style="display:flex; align-items:center; gap:8px; color:var(--text-muted); margin-top:0;">
        <span id="conducted-by-display">${t("conductedByColumn")}: ${escapeHtml(record.conductedBy)}</span>
        <button type="button" class="text-link" id="btn-edit-conducted-by">${t("editButton")}</button>
      </div>
      <div class="field" id="conducted-by-edit-row" hidden style="margin-top:-4px;">
        <input type="text" id="conducted-by-input" value="${escapeHtml(record.conductedBy)}" />
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button type="button" class="btn btn-sm btn-primary" id="btn-save-conducted-by">${t("saveButton")}</button>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-cancel-conducted-by">${t("cancelButton")}</button>
        </div>
      </div>
      ${record.additionalNotes ? `<div data-translatable data-note-text="${escapeHtml(record.additionalNotes)}" data-note-lang="${escapeHtml(record.language || "")}"><em>${escapeHtml(record.additionalNotes)}</em><div class="detail-note-translation" hidden></div></div>` : ""}
      ${sectionsHtml}
      <button type="button" class="text-link" id="modal-delete-submission" style="color:var(--danger); margin-top:14px;">${t("deleteSubmission")}</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  translateNotesIn(backdrop);
  if (expandFlagged && firstFlaggedId !== null) {
    // Mobile Safari can miscalculate scroll geometry for an element
    // queried in the same tick it was inserted — wait a couple of frames
    // so layout has actually settled before scrolling to it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.querySelector(`#detail-row-${firstFlaggedId}`)?.scrollIntoView({ block: "start" });
      });
    });
  }
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#btn-edit-conducted-by").addEventListener("click", () => {
    backdrop.querySelector("#conducted-by-edit-row").hidden = false;
    backdrop.querySelector("#conducted-by-input").focus();
  });
  backdrop.querySelector("#btn-cancel-conducted-by").addEventListener("click", () => {
    backdrop.querySelector("#conducted-by-input").value = record.conductedBy;
    backdrop.querySelector("#conducted-by-edit-row").hidden = true;
  });
  backdrop.querySelector("#btn-save-conducted-by").addEventListener("click", async (e) => {
    const input = backdrop.querySelector("#conducted-by-input");
    const name = input.value.trim();
    if (!name || name === record.conductedBy) {
      backdrop.querySelector("#conducted-by-edit-row").hidden = true;
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = t("loadingButton");
    try {
      await withTimeout(updateDoc(doc(db, "submissions", record.id), { conductedBy: name }));
      record.conductedBy = name;
      backdrop.querySelector("#conducted-by-display").textContent = `${t("conductedByColumn")}: ${name}`;
      backdrop.querySelector("#conducted-by-edit-row").hidden = true;
      refreshCurrentTab();
    } catch (err) {
      alert(err.message === "timeout" ? t("requestTimedOut") : String(err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = t("saveButton");
    }
  });
  backdrop.querySelector("#modal-delete-submission").addEventListener("click", async (e) => {
    if (!confirm(t("confirmDeleteSubmission", { store: record.storeNumber, date: record.date }))) return;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = t("loadingButton");
    await deleteSubmission(record);
    backdrop.remove();
    refreshCurrentTab();
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      return;
    }
    const thumb = e.target.closest("img[data-lightbox]");
    if (thumb) {
      openLightbox(thumb.dataset.lightbox);
      return;
    }
    const row = e.target.closest("[data-toggle-detail]");
    if (row) backdrop.querySelector(`#detail-body-${row.dataset.toggleDetail}`)?.classList.toggle("collapsed");
  });
}

async function deleteSubmission(record) {
  // Subcollections don't cascade-delete with their parent doc, so each
  // photo doc needs deleting first.
  const photosSnap = await getDocs(collection(db, "submissions", record.id, "photos"));
  await Promise.all(photosSnap.docs.map((d) => deleteDoc(doc(db, "submissions", record.id, "photos", d.id))));
  await deleteDoc(doc(db, "submissions", record.id));
}

function refreshCurrentTab() {
  if (activeTab === "today") renderTodayTab();
  else if (activeTab === "weekly") renderWeeklyTab();
  else if (activeTab === "history") runHistorySearch();
}

function openLightbox(url) {
  const lb = document.createElement("div");
  lb.className = "lightbox-backdrop";
  lb.innerHTML = `<button type="button" class="lightbox-close" aria-label="${escapeHtml(t("closeButton"))}">&times;</button><img src="${url}" alt="" />`;
  lb.addEventListener("click", () => lb.remove());
  document.body.appendChild(lb);
}

function exportCsv(rows) {
  if (!rows || rows.length === 0) return;
  // Union of today's checklist items and anything answered in these rows
  // — a question removed after some of these submissions were recorded
  // still gets its own column instead of silently losing that data.
  const itemIds = [...CHECKLIST_ITEMS_FLAT.map((it) => it.id)];
  const seen = new Set(itemIds.map(String));
  for (const r of rows) {
    for (const id of Object.keys(r.answers || {})) {
      if (!seen.has(String(id))) {
        seen.add(String(id));
        itemIds.push(id);
      }
    }
  }
  const header = ["date", "shift", "storeNumber", "storeName", "conductedBy", "submitted", ...itemIds.map((id) => `item_${id}`)];
  const csvRows = [header.join(",")];
  for (const r of rows) {
    const cells = [r.date, r.shift || "", r.storeNumber, r.storeName, r.conductedBy, r.submitted ? "yes" : "no"];
    for (const id of itemIds) {
      cells.push(r.answers?.[id]?.value || "");
    }
    csvRows.push(cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
  }
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `panda-food-safety-${todayDateString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Manage Stores ----------

function renderManageStoresTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `
    <div class="card">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
        <div class="field" style="margin-bottom:0;">
          <label>${t("storeNumberLabel")}</label>
          <input type="text" id="new-store-number" />
        </div>
        <div class="field" style="margin-bottom:0; flex:1;">
          <label>${t("storeNameLabel")} (${t("optionalLabel")})</label>
          <input type="text" id="new-store-name" />
        </div>
        <button class="btn btn-primary" id="btn-add-store">${t("addStore")}</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${storesCache
          .map((s) =>
            editingStoreId === s.id
              ? `
          <div class="store-manage-row">
            <input type="text" class="grow" id="edit-number-${s.id}" value="${escapeHtml(s.number)}" />
            <input type="text" class="grow" id="edit-name-${s.id}" value="${escapeHtml(s.name || "")}" placeholder="${t("optionalLabel")}" />
            <button class="btn btn-sm btn-primary" data-save-edit="${escapeHtml(s.id)}">${t("saveButton")}</button>
            <button class="btn btn-sm btn-secondary" data-cancel-edit="1">${t("cancelButton")}</button>
          </div>`
              : `
          <div class="store-manage-row">
            <div class="grow">${escapeHtml(storeLabel(s.number, s.name))}</div>
            <button class="btn btn-sm btn-secondary" data-edit="${escapeHtml(s.id)}">${t("editButton")}</button>
            <button class="btn btn-sm btn-danger" data-remove="${escapeHtml(s.id)}">${t("deleteButton")}</button>
          </div>`
          )
          .join("")}
      </div>
    </div>
  `;

  content.querySelector("#btn-add-store").addEventListener("click", async () => {
    const number = content.querySelector("#new-store-number").value.trim();
    const name = content.querySelector("#new-store-name").value.trim();
    if (!number) return;
    await setDoc(doc(collection(db, "stores"), number), { number, name, active: true });
    content.querySelector("#new-store-number").value = "";
    content.querySelector("#new-store-name").value = "";
  });

  content.querySelectorAll("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("confirmDeleteStore"))) return;
      await deleteDoc(doc(db, "stores", btn.dataset.remove));
    });
  });

  content.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingStoreId = btn.dataset.edit;
      renderManageStoresTab();
    });
  });

  content.querySelectorAll("button[data-cancel-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingStoreId = null;
      renderManageStoresTab();
    });
  });

  content.querySelectorAll("button[data-save-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const oldId = btn.dataset.saveEdit;
      const newNumber = content.querySelector(`#edit-number-${oldId}`).value.trim();
      const newName = content.querySelector(`#edit-name-${oldId}`).value.trim();
      if (!newNumber) return;
      if (newNumber !== oldId) {
        // The store number is the document id, so renaming it means
        // creating a new document and dropping the old one — existing
        // submissions keep whatever storeNumber they were recorded
        // under, unaffected.
        await setDoc(doc(collection(db, "stores"), newNumber), { number: newNumber, name: newName, active: true });
        await deleteDoc(doc(db, "stores", oldId));
      } else {
        await setDoc(doc(db, "stores", oldId), { number: newNumber, name: newName, active: true });
      }
      editingStoreId = null;
      renderManageStoresTab();
    });
  });
}

// ---------- Manage Checklist ----------

const PHOTO_TIER_NONE = "none";
const PHOTO_TIER_ONFAIL = "onfail";
const PHOTO_TIER_ALWAYS = "always";

function photoTierOf(item) {
  if (item.alwaysPhoto) return PHOTO_TIER_ALWAYS;
  if (item.requiresPhoto) return PHOTO_TIER_ONFAIL;
  return PHOTO_TIER_NONE;
}

function photoTierLabel(tier) {
  if (tier === PHOTO_TIER_ALWAYS) return t("photoTierAlways");
  if (tier === PHOTO_TIER_ONFAIL) return t("photoTierOnFail");
  return t("photoTierNone");
}

// Shared between the flagged-items view and the Manage Checklist editor.
function riskBadgeHtml(risk) {
  if (risk === "high") return `<span class="badge badge-danger">${t("riskHigh")}</span>`;
  if (risk === "medium") return `<span class="badge badge-warning">${t("riskMedium")}</span>`;
  return "";
}

function categoryOptionsHtml(selectedId) {
  const lang = getLang();
  return VIOLATION_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(categoryLabel(c.id, lang))}</option>`).join("");
}

function riskOptionsHtml(selectedRisk) {
  return ["low", "medium", "high"]
    .map((r) => `<option value="${r}" ${r === selectedRisk ? "selected" : ""}>${t(`risk${r[0].toUpperCase()}${r.slice(1)}`)}</option>`)
    .join("");
}

// All items for a section, base + custom, including hidden ones — the
// editor needs to show what's hidden so it can be turned back on, unlike
// the effective (associate-facing) checklist which filters those out.
function allItemsForSection(section) {
  const baseItems = section.items.map((item) => {
    const o = CHECKLIST_OVERRIDES_MAP[item.id] || {};
    const defaults = ITEM_RISK_INFO[item.id] || { category: "other", risk: "medium" };
    return {
      id: item.id,
      en: o.en || item.en,
      es: o.es || item.es,
      requiresPhoto: "requiresPhoto" in o ? o.requiresPhoto : !!item.requiresPhoto,
      alwaysPhoto: "alwaysPhoto" in o ? o.alwaysPhoto : !!item.alwaysPhoto,
      category: o.category || defaults.category,
      risk: o.risk || defaults.risk,
      active: o.active !== false,
      isCustom: false,
    };
  });
  const customItems = Object.entries(CHECKLIST_OVERRIDES_MAP)
    .filter(([, o]) => o.custom && o.sectionId === section.id)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([id, o]) => ({
      id,
      en: o.en,
      es: o.es || o.en,
      requiresPhoto: !!o.requiresPhoto,
      alwaysPhoto: !!o.alwaysPhoto,
      category: o.category || "other",
      risk: o.risk || "medium",
      active: o.active !== false,
      isCustom: true,
    }));
  return [...baseItems, ...customItems];
}

function renderChecklistItemRow(item) {
  if (editingChecklistItemId === item.id) {
    const tier = photoTierOf(item);
    return `
      <div class="checklist-item-row checklist-item-editing" data-item-row="${escapeHtml(item.id)}">
        <div class="field"><label>${t("questionEnglishLabel")}</label><textarea class="edit-item-en" rows="2">${escapeHtml(item.en)}</textarea></div>
        <div class="field"><label>${t("questionSpanishLabel")}</label><textarea class="edit-item-es" rows="2">${escapeHtml(item.es || "")}</textarea></div>
        <div class="field">
          <label>${t("photoTierLabel")}</label>
          <select class="edit-item-tier">
            <option value="${PHOTO_TIER_NONE}" ${tier === PHOTO_TIER_NONE ? "selected" : ""}>${t("photoTierNone")}</option>
            <option value="${PHOTO_TIER_ONFAIL}" ${tier === PHOTO_TIER_ONFAIL ? "selected" : ""}>${t("photoTierOnFail")}</option>
            <option value="${PHOTO_TIER_ALWAYS}" ${tier === PHOTO_TIER_ALWAYS ? "selected" : ""}>${t("photoTierAlways")}</option>
          </select>
        </div>
        <div class="field">
          <label>${t("categoryFieldLabel")}</label>
          <select class="edit-item-category">${categoryOptionsHtml(item.category)}</select>
        </div>
        <div class="field">
          <label>${t("riskFieldLabel")}</label>
          <select class="edit-item-risk">${riskOptionsHtml(item.risk)}</select>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-sm btn-primary" data-save-item="${escapeHtml(item.id)}">${t("saveButton")}</button>
          <button class="btn btn-sm btn-secondary" data-cancel-item-edit="1">${t("cancelButton")}</button>
        </div>
      </div>`;
  }
  return `
    <div class="checklist-item-row ${item.active ? "" : "inactive"}">
      <div class="checklist-item-main">
        <span class="checklist-item-text">${!item.isCustom ? `${escapeHtml(item.id)}. ` : ""}${escapeHtml(item.en)}</span>
        <div class="checklist-item-meta">
          <span class="badge badge-neutral">${photoTierLabel(photoTierOf(item))}</span>
          <span class="badge badge-neutral">${escapeHtml(categoryLabel(item.category, getLang()))}</span>
          ${riskBadgeHtml(item.risk)}
          ${!item.active ? `<span class="badge badge-danger">${t("hiddenBadge")}</span>` : ""}
        </div>
      </div>
      <div class="checklist-item-actions">
        <button class="btn btn-sm btn-secondary" data-edit-item="${escapeHtml(item.id)}">${t("editButton")}</button>
        <button class="btn btn-sm ${item.active ? "btn-secondary" : "btn-primary"}" data-toggle-item="${escapeHtml(item.id)}">${item.active ? t("hideQuestion") : t("showQuestion")}</button>
        ${item.isCustom ? `<button class="btn btn-sm btn-danger" data-delete-item="${escapeHtml(item.id)}">${t("deleteButton")}</button>` : ""}
      </div>
    </div>`;
}

function renderChecklistSectionBlock(group, section) {
  const sectionOverride = CHECKLIST_OVERRIDES_MAP[section.id];
  const isCustomSection = !!sectionOverride?.customSection;
  const sectionActive = !isCustomSection || sectionOverride.active !== false;
  const sectionEn = isCustomSection ? sectionOverride.en : section.en;
  const sectionEs = isCustomSection ? sectionOverride.es : section.es;
  const items = allItemsForSection(section);
  const expanded = expandedChecklistSectionId === section.id;
  return `
    <div class="section-block">
      <button type="button" class="section-toggle" data-toggle-checklist-section="${section.id}">
        <span class="section-name">${escapeHtml(isCustomSection ? sectionEn : tf(section))}${!sectionActive ? ` (${t("hiddenBadge")})` : ""}</span>
        <span class="badge badge-neutral">${items.length}</span>
      </button>
      <div class="section-body ${expanded ? "" : "collapsed"}">
        ${
          isCustomSection
            ? editingChecklistSectionId === section.id
              ? `
          <div class="checklist-item-row checklist-item-editing" data-section-row="${section.id}">
            <div class="field"><label>${t("sectionEnglishLabel")}</label><input class="edit-section-en" value="${escapeHtml(sectionEn)}" /></div>
            <div class="field"><label>${t("sectionSpanishLabel")}</label><input class="edit-section-es" value="${escapeHtml(sectionEs || "")}" /></div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-sm btn-primary" data-save-section="${section.id}">${t("saveButton")}</button>
              <button class="btn btn-sm btn-secondary" data-cancel-section-edit="1">${t("cancelButton")}</button>
            </div>
          </div>`
              : `
          <div class="checklist-item-row ${sectionActive ? "" : "inactive"}">
            <div class="checklist-item-main">
              <span class="checklist-item-text">${t("sectionOptionsLabel")}</span>
              ${!sectionActive ? `<span class="badge badge-danger">${t("hiddenBadge")}</span>` : ""}
            </div>
            <div class="checklist-item-actions">
              <button class="btn btn-sm btn-secondary" data-edit-section="${section.id}">${t("editButton")}</button>
              <button class="btn btn-sm ${sectionActive ? "btn-secondary" : "btn-primary"}" data-toggle-section="${section.id}">${sectionActive ? t("hideQuestion") : t("showQuestion")}</button>
              <button class="btn btn-sm btn-danger" data-delete-section="${section.id}">${t("deleteButton")}</button>
            </div>
          </div>`
            : ""
        }
        ${items.map(renderChecklistItemRow).join("")}
        ${
          addingItemToSectionId === section.id
            ? `
          <div class="checklist-item-row checklist-item-editing">
            <div class="field"><label>${t("questionEnglishLabel")}</label><textarea id="new-item-en" rows="2"></textarea></div>
            <div class="field"><label>${t("questionSpanishLabel")}</label><textarea id="new-item-es" rows="2"></textarea></div>
            <div class="field">
              <label>${t("photoTierLabel")}</label>
              <select id="new-item-tier">
                <option value="${PHOTO_TIER_NONE}">${t("photoTierNone")}</option>
                <option value="${PHOTO_TIER_ONFAIL}">${t("photoTierOnFail")}</option>
                <option value="${PHOTO_TIER_ALWAYS}">${t("photoTierAlways")}</option>
              </select>
            </div>
            <div class="field">
              <label>${t("categoryFieldLabel")}</label>
              <select id="new-item-category">${categoryOptionsHtml("other")}</select>
            </div>
            <div class="field">
              <label>${t("riskFieldLabel")}</label>
              <select id="new-item-risk">${riskOptionsHtml("medium")}</select>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-sm btn-primary" data-save-new-item="${group.id}|${section.id}">${t("saveButton")}</button>
              <button class="btn btn-sm btn-secondary" data-cancel-new-item="1">${t("cancelButton")}</button>
            </div>
          </div>`
            : `<button type="button" class="text-link" data-add-item="${group.id}|${section.id}" style="padding-left:0;">${t("addQuestion")}</button>`
        }
      </div>
    </div>`;
}

// Custom sections belonging to a group, sorted by order — synthesized
// as minimal section objects (renderChecklistSectionBlock pulls their
// real title/state from CHECKLIST_OVERRIDES_MAP via section.id).
function customSectionsForGroup(groupId) {
  return Object.entries(CHECKLIST_OVERRIDES_MAP)
    .filter(([, o]) => o.customSection && o.groupId === groupId)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([id]) => ({ id, items: [] }));
}

function renderManageChecklistTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;

  content.innerHTML = `
    <div class="card"><p style="margin:0; color:var(--text-muted); font-size:13px;">${t("checklistEditorNote")}</p></div>
    ${BASE_CHECKLIST_GROUPS.map(
      (group) => `
      <div class="card">
        <div class="detail-section-title" style="margin-top:0;">${escapeHtml(tf(group))}</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${[...group.sections, ...customSectionsForGroup(group.id)].map((section) => renderChecklistSectionBlock(group, section)).join("")}
        </div>
        ${
          addingSectionToGroupId === group.id
            ? `
          <div class="checklist-item-row checklist-item-editing" style="margin-top:10px;">
            <div class="field"><label>${t("sectionEnglishLabel")}</label><input id="new-section-en" /></div>
            <div class="field"><label>${t("sectionSpanishLabel")}</label><input id="new-section-es" /></div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-sm btn-primary" data-save-new-section="${group.id}">${t("saveButton")}</button>
              <button class="btn btn-sm btn-secondary" data-cancel-new-section="1">${t("cancelButton")}</button>
            </div>
          </div>`
            : `<button type="button" class="text-link" data-add-section="${group.id}" style="padding-left:0; margin-top:10px;">${t("addSection")}</button>`
        }
      </div>`
    ).join("")}
  `;

  content.querySelectorAll("[data-toggle-checklist-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.toggleChecklistSection;
      expandedChecklistSectionId = expandedChecklistSectionId === id ? null : id;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-toggle-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggleItem;
      const items = BASE_CHECKLIST_GROUPS.flatMap((g) => g.sections.flatMap((s) => allItemsForSection(s)));
      const current = items.find((it) => String(it.id) === String(id));
      await setDoc(doc(db, "checklistOverrides", String(id)), { active: !current.active }, { merge: true });
    });
  });

  content.querySelectorAll("[data-edit-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingChecklistItemId = /^\d+$/.test(btn.dataset.editItem) ? Number(btn.dataset.editItem) : btn.dataset.editItem;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-cancel-item-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingChecklistItemId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-save-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.saveItem;
      const row = btn.closest("[data-item-row]");
      const en = row.querySelector(".edit-item-en").value.trim();
      const es = row.querySelector(".edit-item-es").value.trim();
      const tier = row.querySelector(".edit-item-tier").value;
      const category = row.querySelector(".edit-item-category").value;
      const risk = row.querySelector(".edit-item-risk").value;
      if (!en) return;
      await setDoc(
        doc(db, "checklistOverrides", String(id)),
        { en, es, requiresPhoto: tier === PHOTO_TIER_ONFAIL, alwaysPhoto: tier === PHOTO_TIER_ALWAYS, category, risk },
        { merge: true }
      );
      editingChecklistItemId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-delete-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("confirmDeleteQuestion"))) return;
      await deleteDoc(doc(db, "checklistOverrides", btn.dataset.deleteItem));
    });
  });

  content.querySelectorAll("[data-add-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [, sectionId] = btn.dataset.addItem.split("|");
      addingItemToSectionId = sectionId;
      expandedChecklistSectionId = sectionId;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-cancel-new-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addingItemToSectionId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-save-new-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const [groupId, sectionId] = btn.dataset.saveNewItem.split("|");
      const en = content.querySelector("#new-item-en").value.trim();
      const es = content.querySelector("#new-item-es").value.trim();
      const tier = content.querySelector("#new-item-tier").value;
      const category = content.querySelector("#new-item-category").value;
      const risk = content.querySelector("#new-item-risk").value;
      if (!en) return;
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await setDoc(doc(db, "checklistOverrides", id), {
        custom: true,
        groupId,
        sectionId,
        en,
        es,
        requiresPhoto: tier === PHOTO_TIER_ONFAIL,
        alwaysPhoto: tier === PHOTO_TIER_ALWAYS,
        category,
        risk,
        active: true,
        order: Date.now(),
        createdAt: serverTimestamp(),
      });
      addingItemToSectionId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-toggle-section]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggleSection;
      const current = CHECKLIST_OVERRIDES_MAP[id];
      await setDoc(doc(db, "checklistOverrides", id), { active: current.active === false }, { merge: true });
    });
  });

  content.querySelectorAll("[data-edit-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingChecklistSectionId = btn.dataset.editSection;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-cancel-section-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingChecklistSectionId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-save-section]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.saveSection;
      const row = btn.closest("[data-section-row]");
      const en = row.querySelector(".edit-section-en").value.trim();
      const es = row.querySelector(".edit-section-es").value.trim();
      if (!en) return;
      await setDoc(doc(db, "checklistOverrides", id), { en, es }, { merge: true });
      editingChecklistSectionId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-delete-section]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("confirmDeleteSection"))) return;
      await deleteDoc(doc(db, "checklistOverrides", btn.dataset.deleteSection));
    });
  });

  content.querySelectorAll("[data-add-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addingSectionToGroupId = btn.dataset.addSection;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-cancel-new-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addingSectionToGroupId = null;
      renderManageChecklistTab();
    });
  });

  content.querySelectorAll("[data-save-new-section]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const groupId = btn.dataset.saveNewSection;
      const en = content.querySelector("#new-section-en").value.trim();
      const es = content.querySelector("#new-section-es").value.trim();
      if (!en) return;
      const id = `customsection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await setDoc(doc(db, "checklistOverrides", id), {
        customSection: true,
        groupId,
        en,
        es,
        active: true,
        order: Date.now(),
        createdAt: serverTimestamp(),
      });
      addingSectionToGroupId = null;
      expandedChecklistSectionId = id;
      renderManageChecklistTab();
    });
  });
}

// ---------- Manage Admins (owner-only) ----------

function renderManageAdminsTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;

  if (!adminsUnsub) {
    adminsUnsub = onSnapshot(collection(db, "admins"), (snap) => {
      adminsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (activeTab === "admins") renderManageAdminsList();
    });
  }
  renderManageAdminsList();

  function renderManageAdminsList() {
    content.innerHTML = `
      <div class="hint-banner">${t("ownerNote")}</div>
      <div class="card">
        <div class="detail-section-title" style="margin-top:0;">${t("addAdminByEmailTitle")}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
          <div class="field" style="margin-bottom:0; flex:1;">
            <label>${t("adminEmailLabel")}</label>
            <input type="email" id="new-admin-email" placeholder="name@example.com" />
          </div>
          <button class="btn btn-primary" id="btn-add-admin">${t("addAdmin")}</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="store-manage-row">
            <div class="grow"><strong>${escapeHtml(OWNER_EMAIL)}</strong> — ${t("ownerRole")}</div>
          </div>
          ${adminsCache
            .map(
              (a) => `
            <div class="store-manage-row">
              <div class="grow">${escapeHtml(a.username ? `@${a.username}` : a.email)} — ${t("adminRole")}</div>
              <button class="btn btn-sm btn-danger" data-remove="${escapeHtml(a.id)}">${t("deleteButton")}</button>
            </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="card">
        <div class="detail-section-title" style="margin-top:0;">${t("addAdminByUsernameTitle")}</div>
        <p style="color:var(--text-muted); margin-top:0; font-size:13px;">${t("addAdminByUsernameNote")}</p>
        <div class="field">
          <label>${t("newUsernameLabel")}</label>
          <input type="text" id="new-admin-username" autocomplete="off" />
        </div>
        <div class="field">
          <label>${t("newUsernamePasswordLabel")}</label>
          <div class="password-field-wrap">
            <input type="password" id="new-admin-username-password" autocomplete="new-password" />
            <button type="button" class="password-toggle-btn" id="btn-toggle-new-admin-password">${t("showPasswordLabel")}</button>
          </div>
        </div>
        <div class="hint-banner" id="new-admin-username-error" style="color:var(--danger); border-color:var(--danger);" hidden></div>
        <button class="btn btn-primary" id="btn-add-admin-username">${t("addAdmin")}</button>
      </div>
    `;
    wirePasswordToggle(content, "new-admin-username-password", "btn-toggle-new-admin-password");

    content.querySelector("#btn-add-admin").addEventListener("click", async () => {
      const emailInput = content.querySelector("#new-admin-email");
      // Firestore doc IDs are case-sensitive, but email addresses aren't —
      // always normalize to lowercase here so this matches whatever casing
      // Firebase Auth ends up storing for that admin's sign-up/login.
      const email = emailInput.value.trim().toLowerCase();
      if (!email) return;
      await setDoc(doc(db, "admins", email), { email, addedAt: serverTimestamp() });
      emailInput.value = "";
    });

    content.querySelectorAll("button[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(t("confirmRemoveAdmin"))) return;
        const removedAdmin = adminsCache.find((a) => a.id === btn.dataset.remove);
        await deleteDoc(doc(db, "admins", btn.dataset.remove));
        // Free the username back up for reuse — the account itself can't
        // be deleted client-side (no Admin SDK), but removing the
        // roster entry already revokes its access; this just tidies up
        // the now-unusable mapping.
        if (removedAdmin?.username) await deleteDoc(doc(db, "usernames", removedAdmin.username)).catch(() => {});
      });
    });

    content.querySelector("#btn-add-admin-username").addEventListener("click", async () => {
      const usernameInput = content.querySelector("#new-admin-username");
      const passwordInput = content.querySelector("#new-admin-username-password");
      const errorEl = content.querySelector("#new-admin-username-error");
      const btn = content.querySelector("#btn-add-admin-username");
      const username = normalizeUsername(usernameInput.value);
      const password = passwordInput.value;
      errorEl.hidden = true;
      if (!username) {
        errorEl.textContent = t("usernameRequiredError");
        errorEl.hidden = false;
        return;
      }
      if (password.length < 6) {
        errorEl.textContent = t("passwordTooShortError");
        errorEl.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = t("loadingButton");
      try {
        const existing = await withTimeout(getDoc(doc(db, "usernames", username)));
        if (existing.exists()) {
          errorEl.textContent = t("usernameTakenError");
          errorEl.hidden = false;
          return;
        }
        const email = syntheticEmailForUsername(username);
        await withTimeout(createUserOnSecondaryApp(email, password));
        await setDoc(doc(db, "usernames", username), { email, createdAt: serverTimestamp() });
        await setDoc(doc(db, "admins", email), { email, username, addedAt: serverTimestamp() });
        usernameInput.value = "";
        passwordInput.value = "";
      } catch (err) {
        errorEl.textContent =
          err.message === "timeout"
            ? t("requestTimedOut")
            : err.code === "auth/email-already-in-use"
              ? t("usernameTakenError")
              : String(err.message || err);
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = t("addAdmin");
      }
    });
  }
}
