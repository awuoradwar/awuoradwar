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
    renderLoginScreen("login");
    return;
  }
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
        <div class="field">
          <label>${t("emailLabel")}</label>
          <input type="email" id="login-email" autocomplete="username" />
        </div>
        <div class="field">
          <label>${t("passwordLabel")}</label>
          <input type="password" id="login-password" autocomplete="${isSignUp ? "new-password" : "current-password"}" />
        </div>
        <button class="btn btn-primary btn-block" id="btn-submit-auth">${isSignUp ? t("signUpButton") : t("loginButton")}</button>
        <button class="text-link" id="btn-toggle-mode" style="display:block; margin:10px auto 0;">${isSignUp ? t("switchToLogin") : t("switchToSignUp")}</button>
        ${!isSignUp ? `<button class="text-link" id="btn-forgot-password" style="display:block; margin:4px auto 0;">${t("forgotPassword")}</button>` : ""}
      </div>
    </main>
  `;
  wireLangToggle(() => renderLoginScreen(mode, message, messageIsError));
  root.querySelector("#btn-toggle-mode").addEventListener("click", () => renderLoginScreen(isSignUp ? "login" : "signup"));
  root.querySelector("#btn-submit-auth").addEventListener("click", async (e) => {
    const email = root.querySelector("#login-email").value.trim().toLowerCase();
    const password = root.querySelector("#login-password").value;
    const btn = e.currentTarget;
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

function renderDashboard() {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="admin-account-row">
        <a class="text-link" href="#/">${t("backToChecklist")}</a>
        <button class="text-link" id="btn-logout">${t("logoutButton")}</button>
      </div>
      <div class="admin-tabs">
        <button class="btn btn-sm ${activeTab === "today" ? "btn-primary" : "btn-secondary"}" data-tab="today">${t("todayStatusTitle")}</button>
        <button class="btn btn-sm ${activeTab === "weekly" ? "btn-primary" : "btn-secondary"}" data-tab="weekly">${t("weeklySummaryTitle")}</button>
        <button class="btn btn-sm ${activeTab === "history" ? "btn-primary" : "btn-secondary"}" data-tab="history">${t("historyTitle")}</button>
        <button class="btn btn-sm ${activeTab === "stores" ? "btn-primary" : "btn-secondary"}" data-tab="stores">${t("manageStoresTitle")}</button>
        <button class="btn btn-sm ${activeTab === "checklist" ? "btn-primary" : "btn-secondary"}" data-tab="checklist">${t("manageChecklistTitle")}</button>
        ${isOwnerSession ? `<button class="btn btn-sm ${activeTab === "admins" ? "btn-primary" : "btn-secondary"}" data-tab="admins">${t("manageAdminsTitle")}</button>` : ""}
      </div>
      <div id="tab-content"></div>
    </main>
  `;
  wireLangToggle(renderDashboard);
  root.querySelector("#btn-logout").addEventListener("click", () => signOut(auth));
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
  const byStoreNumber = {};
  snap.docs.forEach((d) => {
    byStoreNumber[d.data().storeNumber] = { id: d.id, ...d.data() };
  });

  const doneCount = storesCache.filter((s) => byStoreNumber[s.number]?.submitted).length;
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
          const sub = byStoreNumber[s.number];
          const submitted = Boolean(sub?.submitted);
          const penalize = !submitted && !notYetLaunched;
          return `
          <div class="store-status-card ${penalize ? "missing" : ""} ${submitted ? "clickable" : ""}" ${submitted ? `data-view-today="${escapeHtml(s.number)}"` : ""}>
            <span class="store-name">${escapeHtml(storeLabel(s.number, s.name))}</span>
            <span class="badge ${submitted ? "badge-success" : penalize ? "badge-danger" : "badge-neutral"}">${submitted ? t("submittedStatus") : t("missingStatus")}</span>
          </div>`;
        })
        .join("")}
    </div>
  `;

  content.querySelectorAll("[data-view-today]").forEach((cardEl) => {
    cardEl.addEventListener("click", async () => {
      const record = byStoreNumber[cardEl.dataset.viewToday];
      const hydrated = await hydrateRecordPhotos(record);
      renderDetailModal(hydrated, { expandFlagged: true });
    });
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
    const data = d.data();
    const bucket = (byStore[data.storeNumber] ||= { doneDays: new Set(), flagged: 0, lastSubmittedAt: null });
    if (data.submitted) {
      bucket.doneDays.add(data.date);
      bucket.flagged += Object.values(data.answers || {}).filter((a) => a.value === "no").length;
      const ts = data.submittedAt?.toMillis ? data.submittedAt.toMillis() : 0;
      if (!bucket.lastSubmittedAt || ts > bucket.lastSubmittedAt) bucket.lastSubmittedAt = ts;
    }
  });

  const rows = storesCache
    .map((s) => {
      const b = byStore[s.number] || { doneDays: new Set(), flagged: 0, lastSubmittedAt: null };
      return { store: s, doneDays: b.doneDays.size, flagged: b.flagged, lastSubmittedAt: b.lastSubmittedAt };
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
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${t("filterStore")}</th><th>${t("weeklyDaysColumn")}</th><th>${t("weeklyFlaggedColumn")}</th><th>${t("weeklyLastSubmission")}</th>
          </tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
              <td>${escapeHtml(storeLabel(r.store.number, r.store.name))}</td>
              <td><span class="badge ${r.doneDays === 7 ? "badge-success" : r.doneDays === 0 ? "badge-danger" : "badge-neutral"}">${r.doneDays} / 7</span></td>
              <td>${r.flagged > 0 ? `<button class="btn btn-sm btn-danger" data-view-weekly-flagged="${escapeHtml(r.store.number)}">${r.flagged}</button>` : r.flagged}</td>
              <td>${r.lastSubmittedAt ? formatDateTime({ toDate: () => new Date(r.lastSubmittedAt) }) : t("weeklyNever")}</td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
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
      <div class="quick-range-row">
        <span class="quick-range-label">${t("quickRangeLabel")}</span>
        <button class="btn btn-sm btn-secondary" data-weeks-ago="0">${t("thisWeek")}</button>
        <button class="btn btn-sm btn-secondary" data-weeks-ago="1">${t("lastWeek")}</button>
        <button class="btn btn-sm btn-secondary" data-weeks-ago="2">${t("weeksAgo", { n: 2 })}</button>
        <button class="btn btn-sm btn-secondary" data-weeks-ago="3">${t("weeksAgo", { n: 3 })}</button>
      </div>
      <div class="filters-row">
        <div class="field">
          <label>${t("filterStore")}</label>
          <div class="store-combo">
            <input type="text" id="hist-store-input" autocomplete="off" placeholder="${t("filterAllStores")}" />
            <input type="hidden" id="hist-store" value="" />
            <div class="store-combo-list" id="hist-store-list" hidden></div>
          </div>
        </div>
        <div class="field">
          <label>${t("filterFrom")}</label>
          <input type="date" id="hist-from" value="${fromDefault}" />
        </div>
        <div class="field">
          <label>${t("filterTo")}</label>
          <input type="date" id="hist-to" value="${toDefault}" />
        </div>
        <button class="btn btn-secondary" id="btn-hist-search">${t("historyTitle")}</button>
        <button class="btn btn-secondary" id="btn-hist-export">${t("exportCsv")}</button>
      </div>
    </div>
    <div class="card" id="hist-results"><div class="table-wrap"></div></div>
  `;

  wireStoreCombo({
    inputEl: content.querySelector("#hist-store-input"),
    hiddenEl: content.querySelector("#hist-store"),
    listEl: content.querySelector("#hist-store-list"),
    stores: storesCache,
    allLabel: t("filterAllStores"),
  });

  content.querySelectorAll("[data-weeks-ago]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { from, to } = weekRangeDates(Number(btn.dataset.weeksAgo));
      content.querySelector("#hist-from").value = from;
      content.querySelector("#hist-to").value = to;
      runHistorySearch();
    });
  });

  root.querySelector("#btn-hist-search").addEventListener("click", () => runHistorySearch());
  root.querySelector("#btn-hist-export").addEventListener("click", () => exportCsv(lastHistoryResults));
  runHistorySearch();
}

async function openHistoryRecord(record) {
  const hydrated = await hydrateRecordPhotos(record);
  renderDetailModal(hydrated);
}

async function openFlaggedOnly(records) {
  const hydrated = await Promise.all(records.map((r) => hydrateRecordPhotos(r)));
  renderFlaggedItemsModal(hydrated);
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
              ${a.note ? `<div class="detail-note"><span class="detail-note-label">${t("noteLabel")}:</span> ${escapeHtml(a.note)}</div>` : ""}
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

  if (lastHistoryResults.length === 0) {
    resultsEl.innerHTML = `<div>${t("noSubmissionsFound")}</div>`;
    return;
  }

  resultsEl.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${t("dateColumn")}</th><th>${t("filterStore")}</th><th>${t("conductedByColumn")}</th>
          <th>${t("statusColumn")}</th><th>${t("flaggedItems")}</th><th></th>
        </tr></thead>
        <tbody>
          ${lastHistoryResults
            .map((r) => {
              const flaggedCount = Object.values(r.answers || {}).filter((a) => a.value === "no").length;
              return `<tr>
                <td>${escapeHtml(r.date)}</td>
                <td>${escapeHtml(storeLabel(r.storeNumber, r.storeName))}</td>
                <td>${escapeHtml(r.conductedBy)}</td>
                <td><span class="badge ${r.submitted ? "badge-success" : "badge-neutral"}">${r.submitted ? t("submittedStatus") : t("missingStatus")}</span></td>
                <td>${flaggedCount > 0 ? `<button class="btn btn-sm btn-danger" data-view-flagged="${r.id}">${flaggedCount}</button>` : flaggedCount}</td>
                <td><button class="btn btn-sm btn-secondary" data-view="${r.id}">${t("viewDetail")}</button></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  resultsEl.querySelectorAll("button[data-view], button[data-view-flagged]").forEach((btn) => {
    btn.addEventListener("click", async () => {
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
                ${a.note ? `<div class="detail-note"><span class="detail-note-label">${t("noteLabel")}:</span> ${escapeHtml(a.note)}</div>` : ""}
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
      <p style="color:var(--text-muted); margin-top:0;">${t("conductedByColumn")}: ${escapeHtml(record.conductedBy)}</p>
      ${record.additionalNotes ? `<p><em>${escapeHtml(record.additionalNotes)}</em></p>` : ""}
      ${sectionsHtml}
      <button type="button" class="text-link" id="modal-delete-submission" style="color:var(--danger); margin-top:14px;">${t("deleteSubmission")}</button>
    </div>
  `;
  document.body.appendChild(backdrop);
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
  const header = ["date", "storeNumber", "storeName", "conductedBy", "submitted", ...itemIds.map((id) => `item_${id}`)];
  const csvRows = [header.join(",")];
  for (const r of rows) {
    const cells = [r.date, r.storeNumber, r.storeName, r.conductedBy, r.submitted ? "yes" : "no"];
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
