import {
  auth,
  db,
  OWNER_EMAIL,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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

let initialized = false;
let root;
let activeTab = "today";
let storesCache = [];
let storesUnsub = null;
let lastHistoryResults = [];
let isOwnerSession = false;
let editingStoreId = null;
let adminsCache = [];
let adminsUnsub = null;
let historyPreset = null;
let weeklyOffset = 0;

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
    const matches = currentMatches(filterText).slice(0, 8);

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(getLang() === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
    const adminDoc = await getDoc(doc(db, "admins", user.email));
    if (!adminDoc.exists()) {
      renderNotAdminScreen();
      return;
    }
  }
  ensureStoresSubscription();
  renderDashboard();
}

function renderLoginScreen(mode, errorMsg) {
  const isSignUp = mode === "signup";
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card" style="max-width:360px; margin:40px auto;">
        <h2 style="margin-top:0;">${isSignUp ? t("signUpTitle") : t("loginTitle")}</h2>
        ${errorMsg ? `<div class="hint-banner" style="color:var(--danger); border-color:var(--danger);">${escapeHtml(errorMsg)}</div>` : ""}
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
      </div>
    </main>
  `;
  wireLangToggle(() => renderLoginScreen(mode, errorMsg));
  root.querySelector("#btn-toggle-mode").addEventListener("click", () => renderLoginScreen(isSignUp ? "login" : "signup"));
  root.querySelector("#btn-submit-auth").addEventListener("click", async () => {
    const email = root.querySelector("#login-email").value.trim();
    const password = root.querySelector("#login-password").value;
    try {
      if (isSignUp) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      renderLoginScreen(mode, isSignUp ? err.message : t("loginError"));
    }
  });
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
      renderDashboard();
    });
  });

  if (activeTab === "today") renderTodayTab();
  else if (activeTab === "weekly") renderWeeklyTab();
  else if (activeTab === "history") renderHistoryTab();
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
      renderDetailModal(hydrated);
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

  content.innerHTML = `
    <div class="card">
      <div class="week-nav-row">
        <button class="btn btn-sm btn-secondary" id="btn-week-prev">${t("previousWeek")}</button>
        <strong class="week-range-label">${escapeHtml(formatWeekRangeLabel(from, to))}</strong>
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
    btn.addEventListener("click", () => {
      historyPreset = { storeNumber: btn.dataset.viewWeeklyFlagged, from, to };
      activeTab = "history";
      renderDashboard();
    });
  });
}

// ---------- History ----------

function todayDateStringFor(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Rolling 7-day windows shared by Weekly Summary and History's quick
// filters: weeksAgo=0 is "this week" (today back 6 days), weeksAgo=1 is
// the 7 days before that, and so on — not calendar (Mon-Sun) weeks.
function weekRangeDates(weeksAgo) {
  const to = new Date();
  to.setDate(to.getDate() - weeksAgo * 7);
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: todayDateStringFor(from), to: todayDateStringFor(to) };
}

function renderHistoryTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  const today = todayDateString();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const fromDefault = historyPreset ? historyPreset.from : todayDateStringFor(monthAgo);
  const toDefault = historyPreset ? historyPreset.to : today;
  const storeDefault = historyPreset ? historyPreset.storeNumber : "";
  historyPreset = null;
  const presetStore = storesCache.find((s) => s.number === storeDefault);

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
            <input type="text" id="hist-store-input" autocomplete="off" placeholder="${t("filterAllStores")}" value="${presetStore ? escapeHtml(storeLabel(presetStore.number, presetStore.name)) : ""}" />
            <input type="hidden" id="hist-store" value="${escapeHtml(storeDefault)}" />
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

  root.querySelector("#btn-hist-search").addEventListener("click", runHistorySearch);
  root.querySelector("#btn-hist-export").addEventListener("click", () => exportCsv(lastHistoryResults));
  runHistorySearch();
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
        const hydrated = await hydrateRecordPhotos(record);
        renderDetailModal(hydrated, { expandFlagged: Boolean(btn.dataset.viewFlagged) });
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
  for (const group of CHECKLIST_GROUPS) {
    for (const section of group.sections) {
      sectionsHtml += `<div class="detail-section-title">${escapeHtml(tf(section))}</div>`;
      for (const item of section.items) {
        const a = record.answers?.[item.id] || {};
        const value = a.value || null;
        const isNo = value === "no";
        const badgeClass = value === "yes" ? "badge-success" : value === "no" ? "badge-danger" : "badge-neutral";
        const badgeLabel = value === "yes" ? t("yes") : value === "no" ? t("no") : value === "na" ? t("na") : "—";
        const proofPhoto = item.alwaysPhoto && value === "yes" && a.photoUrl;
        if (isNo && firstFlaggedId === null) firstFlaggedId = item.id;
        sectionsHtml += `
          <div class="detail-row ${isNo ? "detail-row-flagged" : ""}" ${isNo ? `data-toggle-detail="${item.id}"` : ""} id="detail-row-${item.id}">
            <div class="detail-row-main">
              <span class="detail-item-text">${item.id}. ${escapeHtml(tf(item))}</span>
              <span class="badge ${badgeClass}">${badgeLabel}</span>
            </div>
            ${
              isNo
                ? `<div class="detail-row-body ${expandFlagged ? "" : "collapsed"}" id="detail-body-${item.id}">
                    ${a.photoUrl ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />` : ""}
                    ${a.note ? `<div>${escapeHtml(a.note)}</div>` : ""}
                  </div>`
                : proofPhoto
                  ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />`
                  : ""
            }
          </div>`;
      }
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
    </div>
  `;
  document.body.appendChild(backdrop);
  if (expandFlagged && firstFlaggedId !== null) {
    backdrop.querySelector(`#detail-row-${firstFlaggedId}`)?.scrollIntoView({ block: "start" });
  }
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
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

function openLightbox(url) {
  const lb = document.createElement("div");
  lb.className = "lightbox-backdrop";
  lb.innerHTML = `<button type="button" class="lightbox-close" aria-label="${escapeHtml(t("closeButton"))}">&times;</button><img src="${url}" alt="" />`;
  lb.addEventListener("click", () => lb.remove());
  document.body.appendChild(lb);
}

function exportCsv(rows) {
  if (!rows || rows.length === 0) return;
  const itemIds = CHECKLIST_ITEMS_FLAT.map((it) => it.id);
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
      const email = emailInput.value.trim();
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
