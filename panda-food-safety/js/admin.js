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

let initialized = false;
let root;
let activeTab = "today";
let storesCache = [];
let storesUnsub = null;
let lastHistoryResults = [];
let isOwnerSession = false;
let adminsCache = [];
let adminsUnsub = null;

export function initAdminApp() {
  if (initialized) return;
  initialized = true;
  root = document.getElementById("admin-root");
  onAuthStateChanged(auth, handleAuthChange);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  storesUnsub = onSnapshot(query(collection(db, "stores"), orderBy("number")), (snap) => {
    storesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (activeTab === "today") renderTodayTab();
    if (activeTab === "stores") renderManageStoresTab();
  });
}

// ---------- Dashboard shell ----------

function renderDashboard() {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-sm ${activeTab === "today" ? "btn-primary" : "btn-secondary"}" data-tab="today">${t("todayStatusTitle")}</button>
        <button class="btn btn-sm ${activeTab === "weekly" ? "btn-primary" : "btn-secondary"}" data-tab="weekly">${t("weeklySummaryTitle")}</button>
        <button class="btn btn-sm ${activeTab === "history" ? "btn-primary" : "btn-secondary"}" data-tab="history">${t("historyTitle")}</button>
        <button class="btn btn-sm ${activeTab === "stores" ? "btn-primary" : "btn-secondary"}" data-tab="stores">${t("manageStoresTitle")}</button>
        ${isOwnerSession ? `<button class="btn btn-sm ${activeTab === "admins" ? "btn-primary" : "btn-secondary"}" data-tab="admins">${t("manageAdminsTitle")}</button>` : ""}
        <a class="text-link" href="#/" style="margin-left:auto;">${t("backToChecklist")}</a>
        <button class="text-link" id="btn-logout">${t("logoutButton")}</button>
      </div>
      <div id="tab-content"></div>
    </main>
  `;
  wireLangToggle(renderDashboard);
  root.querySelector("#btn-logout").addEventListener("click", () => signOut(auth));
  root.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
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
    byStoreNumber[d.data().storeNumber] = d.data();
  });

  const doneCount = storesCache.filter((s) => byStoreNumber[s.number]?.submitted).length;

  content.innerHTML = `
    <div class="card">
      <strong>${t("storesSubmittedCount", { done: doneCount, total: storesCache.length })}</strong>
    </div>
    <div class="admin-grid">
      ${storesCache
        .map((s) => {
          const sub = byStoreNumber[s.number];
          const submitted = Boolean(sub?.submitted);
          return `
          <div class="store-status-card ${submitted ? "" : "missing"}">
            <div class="store-name">${escapeHtml(s.number)} — ${escapeHtml(s.name)}</div>
            <span class="badge ${submitted ? "badge-success" : "badge-danger"}">${submitted ? t("submittedStatus") : t("missingStatus")}</span>
            ${submitted ? `<div class="meta">${t("submittedAt", { time: formatDateTime(sub.submittedAt), name: escapeHtml(sub.conductedBy) })}</div>` : `<div class="meta">${t("noSubmissionYet")}</div>`}
          </div>`;
        })
        .join("")}
    </div>
  `;
}

// ---------- Weekly Summary ----------

// Rolling 7-day window ending today (not a Mon-Sun calendar week).
function lastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

async function renderWeeklyTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  content.innerHTML = `<div class="card">${t("loadingButton")}</div>`;

  const days = lastNDates(7);
  // Single date-range filter, no equality filter alongside it — this
  // doesn't need a composite index, unlike the per-store History search.
  const snap = await getDocs(
    query(collection(db, "submissions"), where("date", ">=", days[0]), where("date", "<=", days[days.length - 1]))
  );

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
    .sort((a, b) => a.doneDays - b.doneDays || b.flagged - a.flagged);

  content.innerHTML = `
    <div class="card">
      <strong>${t("last7DaysLabel")}</strong>
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
              <td>${escapeHtml(r.store.number)} — ${escapeHtml(r.store.name)}</td>
              <td><span class="badge ${r.doneDays === 7 ? "badge-success" : r.doneDays === 0 ? "badge-danger" : "badge-neutral"}">${r.doneDays} / 7</span></td>
              <td>${r.flagged}</td>
              <td>${r.lastSubmittedAt ? formatDateTime({ toDate: () => new Date(r.lastSubmittedAt) }) : t("weeklyNever")}</td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------- History ----------

function renderHistoryTab() {
  const content = root.querySelector("#tab-content");
  if (!content) return;
  const today = todayDateString();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const fromDefault = todayDateStringFor(monthAgo);

  content.innerHTML = `
    <div class="card">
      <div class="filters-row">
        <div class="field">
          <label>${t("filterStore")}</label>
          <select id="hist-store">
            <option value="">${t("filterAllStores")}</option>
            ${storesCache.map((s) => `<option value="${escapeHtml(s.number)}">${escapeHtml(s.number)} — ${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>${t("filterFrom")}</label>
          <input type="date" id="hist-from" value="${fromDefault}" />
        </div>
        <div class="field">
          <label>${t("filterTo")}</label>
          <input type="date" id="hist-to" value="${today}" />
        </div>
        <button class="btn btn-secondary" id="btn-hist-search">${t("historyTitle")}</button>
        <button class="btn btn-secondary" id="btn-hist-export">${t("exportCsv")}</button>
      </div>
    </div>
    <div class="card" id="hist-results"><div class="table-wrap"></div></div>
  `;

  root.querySelector("#btn-hist-search").addEventListener("click", runHistorySearch);
  root.querySelector("#btn-hist-export").addEventListener("click", () => exportCsv(lastHistoryResults));
  runHistorySearch();
}

function todayDateStringFor(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function runHistorySearch() {
  const storeNumber = root.querySelector("#hist-store").value;
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
                <td>${escapeHtml(r.storeNumber)} — ${escapeHtml(r.storeName)}</td>
                <td>${escapeHtml(r.conductedBy)}</td>
                <td><span class="badge ${r.submitted ? "badge-success" : "badge-neutral"}">${r.submitted ? t("submittedStatus") : t("missingStatus")}</span></td>
                <td>${flaggedCount}</td>
                <td><button class="btn btn-sm btn-secondary" data-view="${r.id}">${t("viewDetail")}</button></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  resultsEl.querySelectorAll("button[data-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const record = lastHistoryResults.find((r) => r.id === btn.dataset.view);
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = t("loadingButton");
      try {
        const hydrated = await hydrateRecordPhotos(record);
        renderDetailModal(hydrated);
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

function renderDetailModal(record) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const flagged = CHECKLIST_ITEMS_FLAT.filter((it) => record.answers?.[it.id]?.value === "no");

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 style="margin:0;">${escapeHtml(record.storeNumber)} — ${escapeHtml(record.date)}</h3>
        <button class="btn btn-sm btn-secondary" id="modal-close">${t("closeButton")}</button>
      </div>
      <p style="color:var(--text-muted); margin-top:0;">${t("conductedByColumn")}: ${escapeHtml(record.conductedBy)}</p>
      ${record.additionalNotes ? `<p><em>${escapeHtml(record.additionalNotes)}</em></p>` : ""}
      <h4>${t("flaggedItems")}</h4>
      ${
        flagged.length === 0
          ? `<p>${t("noFlagged")}</p>`
          : flagged
              .map((it) => {
                const a = record.answers[it.id];
                return `
                <div class="detail-item" style="flex-direction:column; align-items:stretch;">
                  <div><strong>${t("itemNumber", { n: it.id })}</strong>: ${escapeHtml(tf(it))}</div>
                  ${a.photoUrl ? `<img class="photo-thumb" src="${a.photoUrl}" alt="" data-lightbox="${a.photoUrl}" />` : ""}
                  ${a.note ? `<div>${escapeHtml(a.note)}</div>` : ""}
                </div>`;
              })
              .join("")
      }
      ${(() => {
        const proof = CHECKLIST_ITEMS_FLAT.filter((it) => it.alwaysPhoto && record.answers?.[it.id]?.value === "yes" && record.answers[it.id].photoUrl);
        if (proof.length === 0) return "";
        return `
          <h4>${t("documentationPhotos")}</h4>
          ${proof
            .map(
              (it) => `
            <div class="detail-item" style="flex-direction:column; align-items:stretch;">
              <div><strong>${t("itemNumber", { n: it.id })}</strong>: ${escapeHtml(tf(it))}</div>
              <img class="photo-thumb" src="${record.answers[it.id].photoUrl}" alt="" data-lightbox="${record.answers[it.id].photoUrl}" />
            </div>`
            )
            .join("")}`;
      })()}
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
    const thumb = e.target.closest("img[data-lightbox]");
    if (thumb) openLightbox(thumb.dataset.lightbox);
  });
}

function openLightbox(url) {
  const lb = document.createElement("div");
  lb.className = "lightbox-backdrop";
  lb.innerHTML = `<img src="${url}" alt="" />`;
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
          <label>${t("storeNameLabel")}</label>
          <input type="text" id="new-store-name" />
        </div>
        <button class="btn btn-primary" id="btn-add-store">${t("addStore")}</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${storesCache
          .map(
            (s) => `
          <div class="store-manage-row">
            <div class="grow"><strong>${escapeHtml(s.number)}</strong> — ${escapeHtml(s.name)}</div>
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
    if (!number || !name) return;
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
