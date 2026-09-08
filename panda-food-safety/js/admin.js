import {
  auth,
  db,
  OWNER_EMAIL,
  persistenceReady,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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

// Remembers which tab was open across a reload (including the "new
// version available" reload prompt), so it lands back where it was
// instead of always resetting to Today's Status.
const ACTIVE_TAB_KEY = "pfs-admin-active-tab";

function loadActiveTab() {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY) || "today";
  } catch {
    return "today";
  }
}

function saveActiveTab(tab) {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {}
}

let initialized = false;
let root;
let currentUserEmail = null;
let activeTab = loadActiveTab();
let storesCache = [];
let storesUnsub = null;
let lastHistoryResults = [];
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

function topBarHtml() {
  return `
    <div class="top-bar">
      <h1>${escapeHtml(t("appTitle"))} — ${escapeHtml(t("adminLink"))}</h1>
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

// ---------- Auth screens ----------

async function handleAuthChange(user) {
  if (!user || !user.email) {
    currentUserEmail = null;
    renderLoginScreen("login");
    return;
  }
  currentUserEmail = user.email;
  isOwnerSession = user.email === OWNER_EMAIL;
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
  ensureAutoDateRefresh();
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
        <h2 style="margin-top:0;">${isSignUp ? t("signUpTitle") : t("loginTitle")}</h2>
        ${message ? `<div class="hint-banner" ${messageIsError ? 'style="color:var(--danger); border-color:var(--danger);"' : ""}>${escapeHtml(message)}</div>` : ""}
        <form id="login-form">
          <div class="field">
            <label>${t("emailLabel")}</label>
            <input type="email" id="login-email" name="email" autocomplete="username" required />
          </div>
          <div class="field">
            <label>${t("passwordLabel")}</label>
            <input type="password" id="login-password" name="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btn-submit-auth">${isSignUp ? t("signUpButton") : t("loginButton")}</button>
          <button type="button" class="text-link" id="btn-toggle-mode" style="display:block; margin:10px auto 0;">${isSignUp ? t("switchToLogin") : t("switchToSignUp")}</button>
          ${!isSignUp ? `<button type="button" class="text-link" id="btn-forgot-password" style="display:block; margin:4px auto 0;">${t("forgotPassword")}</button>` : ""}
        </form>
      </div>
    </main>
  `;
  wireLangToggle(() => renderLoginScreen(mode, message, messageIsError));
  root.querySelector("#btn-toggle-mode").addEventListener("click", () => renderLoginScreen(isSignUp ? "login" : "signup"));
  // A real <form> with a type="submit" button (rather than a bare button
  // wired only via a click listener) is what lets Safari's Keychain
  // reliably offer to save this password and refill it with Face ID/Touch
  // ID next time — the previous floating-inputs markup made that
  // unreliable. It also gets Enter-to-submit on the password field for
  // free.
  root.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = root.querySelector("#login-email").value.trim().toLowerCase();
    const password = root.querySelector("#login-password").value;
    const btn = root.querySelector("#btn-submit-auth");
    btn.disabled = true;
    btn.textContent = t("loadingButton");
    try {
      await persistenceReady;
      if (isSignUp) await withTimeout(createUserWithEmailAndPassword(auth, email, password));
      else await withTimeout(signInWithEmailAndPassword(auth, email, password));
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

function secondaryTabs() {
  const tabs = [
    ["stores", "manageStoresTitle"],
    ["checklist", "manageChecklistTitle"],
  ];
  if (isOwnerSession) tabs.push(["admins", "manageAdminsTitle"]);
  return tabs;
}

function renderDashboard() {
  const isSecondaryActive = secondaryTabs().some(([key]) => key === activeTab);
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="admin-account-row">
        <a class="text-link" href="#/">${t("backToChecklist")}</a>
        <div class="dropdown-wrap">
          <button type="button" class="btn btn-sm btn-secondary" id="btn-account-menu">⚙ ${t("accountMenuLabel")}</button>
          <div class="dropdown-menu" id="account-dropdown" hidden>
            <button type="button" class="dropdown-item" id="btn-reset-password">${t("resetPasswordButton")}</button>
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
          ${secondaryTabs()
            .map(
              ([key, labelKey]) =>
                `<button type="button" class="dropdown-item ${activeTab === key ? "dropdown-item-active" : ""}" data-tab="${key}">${t(labelKey)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div id="tab-content"></div>
    </main>
  `;
  wireLangToggle(renderDashboard);
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

  function closeDropdowns() {
    root.querySelector("#account-dropdown").hidden = true;
    root.querySelector("#more-tabs-dropdown").hidden = true;
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
  document.addEventListener("click", closeDropdowns);

  root.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      if (activeTab === "weekly") weeklyOffset = 0;
      saveActiveTab(activeTab);
      renderDashboard();
    });
  });

  if (activeTab === "today") renderTodayTab();
  else if (activeTab === "weekly") renderWeeklyTab();
  else if (activeTab === "history") renderHistoryTab();
  else if (activeTab === "checklist") renderManageChecklistTab();
  else if (activeTab === "admins" && isOwnerSession) renderManageAdminsTab();
  else renderManageStoresTab();
}

// ---------- Today's Status ----------

async function renderTodayTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `<div class="card">${t("loadingButton")}</div>`;

  const today = todayDateString();
  const snap = await getDocs(query(collection(db, "submissions"), where("date", "==", today)));
  const docsByStoreNumber = {};
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    (docsByStoreNumber[data.storeNumber] ||= []).push(data);
  });

  const coveredByStoreNumber = {};
  storesCache.forEach((s) => {
    coveredByStoreNumber[s.number] = shiftsCoveredForDay(docsByStoreNumber[s.number] || []);
  });

  const doneCount = storesCache.filter((s) => coveredByStoreNumber[s.number].doneCount === 3).length;
  const dateLocale = getLang() === "es" ? "es-US" : "en-US";
  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString(dateLocale, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const notYetLaunched = today < LAUNCH_DATE;

  content.innerHTML = `
    <div class="card">
      <strong>${t("storesSubmittedCount", { done: doneCount, total: storesCache.length })}</strong>
      <div style="color:var(--text-muted); font-size:13px;">${todayLabel}</div>
    </div>
    <div class="admin-grid">
      ${storesCache
        .map((s) => {
          const covered = coveredByStoreNumber[s.number];
          const anyInProgress = (docsByStoreNumber[s.number] || []).some((d) => !d.submitted);
          const complete = covered.doneCount === 3;
          const started = covered.doneCount > 0 || anyInProgress;
          const penalize = !complete && !started && !notYetLaunched;
          // Missing first (needs the most attention), then partially
          // started, then all 3 shifts complete — store number order is
          // kept within each group rather than interleaving all three.
          const statusRank = complete ? 2 : started ? 1 : 0;
          return { s, covered, complete, started, penalize, statusRank };
        })
        .sort((a, b) => a.statusRank - b.statusRank || Number(a.s.number) - Number(b.s.number))
        .map(({ s, covered, complete, started, penalize }) => {
          const badgeClass = complete ? "badge-success" : started ? "badge-info" : penalize ? "badge-danger" : "badge-neutral";
          return `
          <div class="store-status-card ${penalize ? "missing" : ""} clickable" data-view-today="${escapeHtml(s.number)}">
            <span class="store-name">${escapeHtml(storeLabel(s.number, s.name))}</span>
            <span class="badge ${badgeClass}">${covered.doneCount} / 3</span>
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
}

// Drill-down from a store's "X / 3" card on Today's Status: shows each of
// the 3 shifts' status for today (or, for a legacy pre-shift-feature
// submission, the single day-covering submission it came from) with a
// way to open the full detail for any that were actually submitted.
function renderDayShiftsModal(store, docs, covered) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const today = todayDateString();

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
        const inProgressDoc = docs.find((d) => d.id === shiftDocId(store.number, today, shiftKey) && !d.submitted);
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
        <h3 style="margin:0;">${escapeHtml(storeLabel(store.number, store.name))} — ${escapeHtml(today)}</h3>
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

// ---------- Weekly Summary ----------

function formatWeekRangeLabel(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lang = getLang() === "es" ? "es-US" : "en-US";
  const fromStr = new Date(fy, fm - 1, fd).toLocaleDateString(lang, { month: "short", day: "numeric" });
  const toStr = new Date(ty, tm - 1, td).toLocaleDateString(lang, { month: "short", day: "numeric", year: "numeric" });
  return `${fromStr} – ${toStr}`;
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
    }
  });

  // A day only counts as done once all 3 shifts (or one legacy
  // pre-shift-feature submission) are submitted for it.
  const rows = storesCache
    .map((s) => {
      const b = byStore[s.number] || { docsByDate: {}, flagged: 0, lastSubmittedAt: null };
      const doneDays = Object.values(b.docsByDate).filter((docsForDay) => shiftsCoveredForDay(docsForDay).doneCount === 3).length;
      return { store: s, doneDays, flagged: b.flagged, lastSubmittedAt: b.lastSubmittedAt };
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
            const doneDaysBadgeClass = r.doneDays === 7 ? "badge-success" : r.doneDays === 0 ? "badge-danger" : "badge-neutral";
            const lastSub = r.lastSubmittedAt ? formatDateTime({ toDate: () => new Date(r.lastSubmittedAt) }) : t("weeklyNever");
            return `
            <div class="history-card">
              <div class="history-card-top">
                <strong>${escapeHtml(storeLabel(r.store.number, r.store.name))}</strong>
                <span class="badge ${doneDaysBadgeClass}">${r.doneDays} / 7</span>
              </div>
              <div class="history-card-meta">${escapeHtml(t("weeklyLastSubmission"))}: ${escapeHtml(lastSub)}</div>
              ${r.flagged > 0 ? `<div class="history-card-actions"><button class="btn btn-sm btn-danger" data-view-weekly-flagged="${escapeHtml(r.store.number)}">${escapeHtml(t("weeklyFlaggedColumn"))}: ${r.flagged}</button></div>` : ""}
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
// Collapsed by default — the filter form (quick ranges, store, date
// range, actions) was taking up most of the screen before any results
// even showed. Stays expanded/collapsed across tab switches once an
// admin has touched it, same as histViewMode.
let histFiltersExpanded = false;

function renderHistoryTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  const today = todayDateString();
  const monthAgo = nowInBusinessTZ();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const fromDefault = todayDateStringFor(monthAgo);
  const toDefault = today;

  content.innerHTML = `
    <div class="card">
      <button type="button" class="hist-filters-toggle" id="btn-toggle-filters">
        <span id="hist-filters-summary"></span>
        <span class="hist-filters-caret">${t("filtersLabel")} ${histFiltersExpanded ? "▲" : "▼"}</span>
      </button>
      <div class="hist-filters-body" id="hist-filters-body" ${histFiltersExpanded ? "" : "hidden"}>
        <div class="quick-range-row">
          <span class="quick-range-label">${t("quickRangeLabel")}</span>
          <button class="btn btn-sm btn-secondary" data-weeks-ago="0">${t("thisWeek")}</button>
          <button class="btn btn-sm btn-secondary" data-weeks-ago="1">${t("lastWeek")}</button>
          <button class="btn btn-sm btn-secondary" data-weeks-ago="2">${t("weeksAgo", { n: 2 })}</button>
          <button class="btn btn-sm btn-secondary" data-weeks-ago="3">${t("weeksAgo", { n: 3 })}</button>
        </div>
        <div class="field">
          <label>${t("filterStore")}</label>
          <div class="store-combo">
            <input type="text" id="hist-store-input" autocomplete="off" placeholder="${t("filterAllStores")}" />
            <input type="hidden" id="hist-store" value="" />
            <div class="store-combo-list" id="hist-store-list" hidden></div>
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
          <button class="btn btn-secondary" id="btn-hist-search">${t("searchButton")}</button>
          <button class="btn btn-secondary" id="btn-hist-export">${t("exportCsv")}</button>
        </div>
      </div>
    </div>
    <div class="card" id="hist-results"></div>
  `;

  function updateViewModeVisibility() {
    const storeNumber = content.querySelector("#hist-store").value;
    content.querySelector("#hist-view-mode-row").hidden = !storeNumber;
    if (!storeNumber) histViewMode = "daily";
  }

  content.querySelector("#btn-toggle-filters").addEventListener("click", () => {
    histFiltersExpanded = !histFiltersExpanded;
    content.querySelector("#hist-filters-body").hidden = !histFiltersExpanded;
    content.querySelector(".hist-filters-caret").textContent = `${t("filtersLabel")} ${histFiltersExpanded ? "▲" : "▼"}`;
  });

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

  content.querySelectorAll("[data-weeks-ago]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { from, to } = weekRangeDates(Number(btn.dataset.weeksAgo));
      content.querySelector("#hist-from").value = from;
      content.querySelector("#hist-to").value = to;
      runHistorySearch();
    });
  });

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

  root.querySelector("#btn-hist-search").addEventListener("click", () => runHistorySearch());
  root.querySelector("#btn-hist-export").addEventListener("click", () => exportCsv(lastHistoryResults));
  runHistorySearch();
}

function updateHistFiltersSummary() {
  const summaryEl = root.querySelector("#hist-filters-summary");
  if (!summaryEl) return;
  const from = root.querySelector("#hist-from").value;
  const to = root.querySelector("#hist-to").value;
  const storeNumber = root.querySelector("#hist-store").value;
  const store = storesCache.find((s) => s.number === storeNumber);
  const storeText = store ? storeLabel(store.number, store.name) : t("filterAllStores");
  summaryEl.textContent = `${formatWeekRangeLabel(from, to)} · ${storeText}`;
}

async function openHistoryRecord(record) {
  const hydrated = await hydrateRecordPhotos(record);
  renderDetailModal(hydrated);
}

async function openFlaggedOnly(records) {
  const hydrated = await Promise.all(records.map((r) => hydrateRecordPhotos(r)));
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
        const item = findItemDefinitionById(id) || { id, en: `#${id}`, es: `#${id}` };
        flaggedRows.push({ record, item, a });
      }
    }
  }

  const rowsHtml = flaggedRows.length
    ? flaggedRows
        .map(
          ({ record, item, a }) => `
          <div class="detail-row detail-row-flagged">
            <div class="detail-row-main">
              <span class="detail-item-text">${multi ? `<span class="detail-flagged-date">${escapeHtml(record.date)}</span> — ` : ""}${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
              <span class="badge badge-danger">${t("no")}</span>
            </div>
            <div class="detail-row-body">
              ${a.photoUrl ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />` : ""}
              ${a.note ? `<div class="detail-note" data-translatable data-note-text="${escapeHtml(a.note)}" data-note-lang="${escapeHtml(record.language || "")}"><span class="detail-note-label">${t("noteLabel")}:</span> ${escapeHtml(a.note)}<div class="detail-note-translation" hidden></div></div>` : ""}
            </div>
          </div>`
        )
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
  updateHistFiltersSummary();

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
  expandedHistoryWeek = null;
  renderHistoryResults();
}

function renderHistoryResults() {
  const resultsEl = root.querySelector("#hist-results");
  if (!resultsEl) return;
  if (lastHistoryResults.length === 0) {
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
  resultsEl.innerHTML = `<div class="history-list">${lastHistoryResults.map((r) => historyDayCardHtml(r, dateLocale)).join("")}</div>`;
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
  const weeks = groupRecordsByWeek(lastHistoryResults);
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
    return `
      <div class="detail-row ${isNo ? "detail-row-flagged" : ""}" ${isNo ? `data-toggle-detail="${item.id}"` : ""} id="detail-row-${item.id}">
        <div class="detail-row-main">
          <span class="detail-item-text">${!String(item.id).startsWith("custom-") ? `${item.id}. ` : ""}${escapeHtml(tf(item))}</span>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
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

// All items for a section, base + custom, including hidden ones — the
// editor needs to show what's hidden so it can be turned back on, unlike
// the effective (associate-facing) checklist which filters those out.
function allItemsForSection(section) {
  const baseItems = section.items.map((item) => {
    const o = CHECKLIST_OVERRIDES_MAP[item.id] || {};
    return {
      id: item.id,
      en: o.en || item.en,
      es: o.es || item.es,
      requiresPhoto: "requiresPhoto" in o ? o.requiresPhoto : !!item.requiresPhoto,
      alwaysPhoto: "alwaysPhoto" in o ? o.alwaysPhoto : !!item.alwaysPhoto,
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
      if (!en) return;
      await setDoc(
        doc(db, "checklistOverrides", String(id)),
        { en, es, requiresPhoto: tier === PHOTO_TIER_ONFAIL, alwaysPhoto: tier === PHOTO_TIER_ALWAYS },
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
              <div class="grow">${escapeHtml(a.email)} — ${t("adminRole")}</div>
              <button class="btn btn-sm btn-danger" data-remove="${escapeHtml(a.id)}">${t("deleteButton")}</button>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;

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
        await deleteDoc(doc(db, "admins", btn.dataset.remove));
      });
    });
  }
}
