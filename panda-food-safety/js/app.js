import {
  auth,
  db,
  storage,
  signInAnonymously,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  orderBy,
  where,
  query,
  getDocs,
  serverTimestamp,
  storageRef,
  uploadBytes,
  getDownloadURL,
} from "./firebase-init.js";

let initialized = false;
let root;
let stores = [];
let storesLoaded = false;

// Current in-progress submission, once a walkthrough is started.
let session = null; // { docId, storeNumber, storeName, conductedBy, answers, additionalNotes }
let pendingWrites = 0;
const saveTimers = {};

export function initAssociateApp() {
  if (initialized) return;
  initialized = true;
  root = document.getElementById("associate-root");

  onSnapshot(query(collection(db, "stores"), orderBy("number")), (snap) => {
    stores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    storesLoaded = true;
    if (!session) renderSetupScreen();
  });

  renderSetupScreen();
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function todayDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(d = new Date()) {
  return d.toLocaleString(getLang() === "es" ? "es-US" : "en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Rolling 7-day window ending today, oldest first — not a Mon-Sun
// calendar week, so it always has a full 7 days of context regardless
// of what day someone checks it.
function lastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(todayDateString(d));
  }
  return dates;
}

async function fetchStoreWeeklySubmissions(storeNumber) {
  await ensureAuth();
  const days = lastNDates(7);
  const snap = await getDocs(
    query(
      collection(db, "submissions"),
      where("storeNumber", "==", storeNumber),
      where("date", ">=", days[0]),
      where("date", "<=", days[days.length - 1])
    )
  );
  return snap.docs.map((d) => d.data());
}

function renderWeeklySummaryPanel(submissions) {
  const days = lastNDates(7);
  const byDate = {};
  submissions.forEach((s) => {
    byDate[s.date] = s;
  });
  const doneDays = days.filter((d) => byDate[d]?.submitted).length;
  const flaggedTotal = submissions.reduce(
    (sum, s) => sum + Object.values(s.answers || {}).filter((a) => a.value === "no").length,
    0
  );

  const rows = days
    .map((d) => {
      const sub = byDate[d];
      const submitted = Boolean(sub?.submitted);
      const flagged = submitted ? Object.values(sub.answers || {}).filter((a) => a.value === "no").length : null;
      return `<tr>
        <td>${d}</td>
        <td><span class="badge ${submitted ? "badge-success" : "badge-neutral"}">${submitted ? t("submittedStatus") : t("missingStatus")}</span></td>
        <td>${flagged === null ? "—" : flagged}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="card">
      <strong>${t("daysSubmittedLabel", { done: doneDays, total: 7 })}</strong>
      <div style="color:var(--text-muted); font-size:13px; margin:2px 0 12px;">${t("last7DaysLabel")} · ${t("flaggedThisWeekLabel", { n: flaggedTotal })}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>${t("dateColumn")}</th><th>${t("statusColumn")}</th><th>${t("weeklyFlaggedColumn")}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function formatTime(d) {
  if (!d) return "";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleTimeString(getLang() === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit" });
}

function topBarHtml() {
  return `
    <div class="top-bar">
      <h1>${escapeHtml(t("appTitle"))}</h1>
      <div class="lang-toggle">
        <button data-lang="en" class="${getLang() === "en" ? "active" : ""}">EN</button>
        <button data-lang="es" class="${getLang() === "es" ? "active" : ""}">ES</button>
      </div>
      <a class="text-link" href="#/admin">${t("adminLink")}</a>
    </div>`;
}

function wireLangToggle(onChange) {
  root.querySelectorAll(".lang-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      onChange();
    });
  });
}

// ---------- Screen 1: setup ----------

function renderSetupScreen() {
  const storeOptions = stores
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.number)} — ${escapeHtml(s.name)}</option>`)
    .join("");

  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card">
        <div class="field">
          <label>${t("storeLabel")}</label>
          ${
            storesLoaded && stores.length === 0
              ? `<div class="hint-banner">${t("noStoresConfigured")}</div>`
              : `<select id="store-select" ${storesLoaded ? "" : "disabled"}>
                  <option value="">${t("storeSelectPlaceholder")}</option>
                  ${storeOptions}
                </select>`
          }
          <div id="weekly-summary-toggle"></div>
        </div>
        <div id="weekly-summary-panel"></div>
        <div class="field">
          <label>${t("conductedByLabel")}</label>
          <input type="text" id="conducted-by" placeholder="${t("conductedByPlaceholder")}" autocomplete="name" />
        </div>
        <div class="field">
          <label>${t("dateTimeLabel")}</label>
          <div class="readonly-field" id="now-display">${formatDateTime()}</div>
        </div>
        <button class="btn btn-primary btn-block" id="btn-start" disabled>${t("startButton")}</button>
      </div>
    </main>
  `;

  wireLangToggle(renderSetupScreen);

  const storeSelect = root.querySelector("#store-select");
  const nameInput = root.querySelector("#conducted-by");
  const startBtn = root.querySelector("#btn-start");
  const weeklyToggleEl = root.querySelector("#weekly-summary-toggle");
  const weeklyPanelEl = root.querySelector("#weekly-summary-panel");

  function refreshStartEnabled() {
    const ok = storeSelect && storeSelect.value && nameInput.value.trim().length > 1;
    startBtn.disabled = !ok;
  }
  if (storeSelect) storeSelect.addEventListener("change", refreshStartEnabled);
  nameInput.addEventListener("input", refreshStartEnabled);

  function renderWeeklyToggle(expanded) {
    if (!storeSelect || !storeSelect.value) {
      weeklyToggleEl.innerHTML = "";
      weeklyPanelEl.innerHTML = "";
      return;
    }
    weeklyToggleEl.innerHTML = `<button type="button" class="text-link" id="btn-weekly-toggle" style="padding-left:0;">${expanded ? t("hideWeeklySummary") : t("viewWeeklySummary")}</button>`;
    weeklyToggleEl.querySelector("#btn-weekly-toggle").addEventListener("click", async () => {
      if (expanded) {
        weeklyPanelEl.innerHTML = "";
        renderWeeklyToggle(false);
        return;
      }
      weeklyPanelEl.innerHTML = `<div class="card">${t("loadingButton")}</div>`;
      renderWeeklyToggle(true);
      const store = stores.find((s) => s.id === storeSelect.value);
      try {
        const submissions = await fetchStoreWeeklySubmissions(store.number);
        weeklyPanelEl.innerHTML = renderWeeklySummaryPanel(submissions);
      } catch (err) {
        console.error(err);
        weeklyPanelEl.innerHTML = `<div class="hint-banner">${escapeHtml(err.message || String(err))}</div>`;
      }
    });
  }
  if (storeSelect) {
    storeSelect.addEventListener("change", () => renderWeeklyToggle(false));
    renderWeeklyToggle(false);
  }

  const clockTimer = setInterval(() => {
    const el = root.querySelector("#now-display");
    if (el) el.textContent = formatDateTime();
    else clearInterval(clockTimer);
  }, 30000);

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = t("loadingButton");
    const store = stores.find((s) => s.id === storeSelect.value);
    try {
      await beginWalkthrough(store, nameInput.value.trim());
    } catch (err) {
      console.error(err);
      alert(err.message || String(err));
      startBtn.disabled = false;
      startBtn.textContent = t("startButton");
    }
  });
}

async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((err) => {
      unsub();
      reject(err);
    });
  });
}

async function beginWalkthrough(store, conductedBy) {
  await ensureAuth();
  const date = todayDateString();
  const docId = `${store.number}_${date}`;
  const ref = doc(db, "submissions", docId);
  const snap = await getDoc(ref);

  if (snap.exists() && snap.data().submitted) {
    renderAlreadySubmittedScreen(store, docId, snap.data());
    return;
  }

  let data;
  if (snap.exists()) {
    data = snap.data();
  } else {
    data = {
      storeId: store.id,
      storeNumber: store.number,
      storeName: store.name,
      conductedBy,
      date,
      language: getLang(),
      startedAt: serverTimestamp(),
      submitted: false,
      answers: {},
      additionalNotes: "",
    };
    await setDoc(ref, data);
  }

  session = {
    docId,
    storeNumber: store.number,
    storeName: store.name,
    conductedBy: data.conductedBy || conductedBy,
    answers: { ...(data.answers || {}) },
    additionalNotes: data.additionalNotes || "",
  };
  renderChecklistScreen();
}

function renderAlreadySubmittedScreen(store, docId, data) {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card" style="text-align:center;">
        <div style="font-size:40px;">✅</div>
        <h2>${t("alreadySubmittedTitle")}</h2>
        <p>${t("alreadySubmittedBody", { name: escapeHtml(data.conductedBy), time: formatTime(data.submittedAt) })}</p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-secondary" id="btn-edit-anyway">${t("editAnyway")}</button>
          <button class="btn btn-primary" id="btn-start-over">${t("startAnotherStore")}</button>
        </div>
      </div>
    </main>
  `;
  wireLangToggle(() => renderAlreadySubmittedScreen(store, docId, data));
  root.querySelector("#btn-start-over").addEventListener("click", () => {
    session = null;
    renderSetupScreen();
  });
  root.querySelector("#btn-edit-anyway").addEventListener("click", () => {
    session = {
      docId,
      storeNumber: store.number,
      storeName: store.name,
      conductedBy: data.conductedBy,
      answers: { ...(data.answers || {}) },
      additionalNotes: data.additionalNotes || "",
    };
    renderChecklistScreen();
  });
}

// ---------- Screen 2: checklist ----------

// Three tiers, set per item in checklist-data.js:
//  - `alwaysPhoto`: needs a documentation photo every time it's checked,
//    pass or fail (on "No" it also needs the course-of-action text).
//  - `requiresPhoto`: needs a photo only when it fails, alongside the
//    course-of-action text.
//  - neither flag (the majority of items): no photo is ever required —
//    a failed answer just needs the course-of-action text.
function itemIsComplete(item, answer) {
  if (!answer || !answer.value) return false;
  if (answer.value === "na") return true;
  if (answer.value === "yes") {
    return item.alwaysPhoto ? Boolean(answer.photoUrl) : true;
  }
  // "no"
  const needsPhoto = item.alwaysPhoto || item.requiresPhoto;
  if (needsPhoto && !answer.photoUrl) return false;
  return Boolean(answer.note && answer.note.trim());
}

function renderItemRow(item) {
  const answer = session.answers[item.id];
  const value = answer?.value || null;
  const isNo = value === "no";
  const showFollowup = isNo || (value === "yes" && item.alwaysPhoto);
  const complete = itemIsComplete(item, answer);
  return `
    <div class="item-row ${isNo ? "flagged" : ""} ${complete ? "complete" : ""}" id="item-${item.id}">
      <div class="item-text"><span class="item-number">${item.id}.</span>${escapeHtml(tf(item))}</div>
      <div class="segmented">
        <button class="sel-yes ${value === "yes" ? "selected" : ""}" data-item="${item.id}" data-value="yes">${t("yes")}</button>
        <button class="sel-no ${value === "no" ? "selected" : ""}" data-item="${item.id}" data-value="no">${t("no")}</button>
        <button class="sel-na ${value === "na" ? "selected" : ""}" data-item="${item.id}" data-value="na">${t("na")}</button>
      </div>
      ${showFollowup ? renderFollowup(item, answer, isNo) : ""}
    </div>`;
}

function renderFollowup(item, answer, isFail) {
  const photoUrl = answer?.photoUrl || "";
  const note = answer?.note || "";
  const needsPhoto = item.alwaysPhoto || (isFail && item.requiresPhoto);
  return `
    <div class="flagged-followup">
      ${
        needsPhoto
          ? `<div class="photo-required-label">📷 ${isFail ? t("photoRequiredLabel") : t("photoProofLabel")}</div>
      ${photoUrl ? `<img class="photo-preview" src="${photoUrl}" alt="" />` : `<div id="upload-status-${item.id}"></div>`}
      <label class="file-btn btn btn-secondary btn-sm">
        <span class="photo-btn-label-${item.id}">${photoUrl ? t("retakePhoto") : t("takePhoto")}</span>
        <input type="file" accept="image/*" capture="environment" class="photo-input" data-item="${item.id}" />
      </label>`
          : ""
      }
      ${
        isFail
          ? `<div>
        <label>${t("noteLabel")}</label>
        <textarea class="note-input" data-item="${item.id}" placeholder="${escapeHtml(t("notePlaceholder"))}">${escapeHtml(note)}</textarea>
      </div>`
          : ""
      }
    </div>`;
}

function computeProgress() {
  const total = CHECKLIST_TOTAL_ITEMS;
  let done = 0;
  for (const item of CHECKLIST_ITEMS_FLAT) {
    if (itemIsComplete(item, session.answers[item.id])) done++;
  }
  return { done, total };
}

function renderChecklistScreen() {
  let body = "";
  for (const group of CHECKLIST_GROUPS) {
    body += `<div class="group-title">${escapeHtml(tf(group))}</div>`;
    for (const section of group.sections) {
      body += `<div class="section-header">${escapeHtml(tf(section))}</div>`;
      for (const item of section.items) {
        body += renderItemRow(item);
      }
    }
  }

  root.innerHTML = `
    ${topBarHtml()}
    <main id="checklist-body">
      <div class="card">
        <strong>${escapeHtml(session.storeNumber)} — ${escapeHtml(session.storeName)}</strong>
        <div style="color:var(--text-muted); font-size:13px;">${escapeHtml(session.conductedBy)} · ${formatDateTime()}</div>
      </div>
      ${body}
      <div class="card">
        <label>${t("additionalNotesLabel")}</label>
        <textarea id="additional-notes" placeholder="${escapeHtml(t("additionalNotesPlaceholder"))}">${escapeHtml(session.additionalNotes)}</textarea>
      </div>
      <div class="save-indicator" id="save-indicator"></div>
    </main>
    <div class="sticky-footer">
      <div class="progress-row">
        <div class="progress-track" style="flex:1;"><div class="progress-fill" id="progress-fill"></div></div>
        <span id="progress-label"></span>
      </div>
      <button class="btn btn-primary btn-block" id="btn-submit">${t("submitButton")}</button>
      <div class="remaining-note" id="remaining-note"></div>
    </div>
  `;

  wireLangToggle(renderChecklistScreen);
  refreshProgressUI();

  const body_ = root.querySelector("#checklist-body");
  body_.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (btn) onValueClick(Number(btn.dataset.item), btn.dataset.value);
  });
  body_.addEventListener("change", (e) => {
    const fileInput = e.target.closest("input.photo-input");
    if (fileInput && fileInput.files[0]) onPhotoSelected(Number(fileInput.dataset.item), fileInput.files[0]);
  });
  body_.addEventListener("input", (e) => {
    const ta = e.target.closest("textarea.note-input");
    if (ta) onNoteInput(Number(ta.dataset.item), ta.value);
  });
  root.querySelector("#additional-notes").addEventListener("input", (e) => {
    session.additionalNotes = e.target.value;
    scheduleSave("additionalNotes", { additionalNotes: e.target.value });
  });

  root.querySelector("#btn-submit").addEventListener("click", onSubmit);
}

function refreshProgressUI() {
  const { done, total } = computeProgress();
  const fill = root.querySelector("#progress-fill");
  const label = root.querySelector("#progress-label");
  const remaining = root.querySelector("#remaining-note");
  const submitBtn = root.querySelector("#btn-submit");
  if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
  if (label) label.textContent = t("progressLabel", { done, total });
  if (remaining) remaining.textContent = done < total ? t("itemsRemaining", { n: total - done }) : "";
  if (submitBtn) submitBtn.disabled = done < total;
}

function reRenderItem(itemId) {
  const item = CHECKLIST_ITEMS_FLAT.find((it) => it.id === itemId);
  const el = document.getElementById(`item-${itemId}`);
  if (!item || !el) return;
  el.outerHTML = renderItemRow(item);
  refreshProgressUI();
}

function scheduleSave(key, patch, immediate = false) {
  const indicator = root.querySelector("#save-indicator");
  if (indicator) indicator.textContent = t("savingIndicator");
  clearTimeout(saveTimers[key]);
  const flush = async () => {
    pendingWrites++;
    try {
      await updateDoc(doc(db, "submissions", session.docId), { ...patch, lastUpdated: serverTimestamp() });
    } catch (err) {
      console.error("save failed", err);
    } finally {
      pendingWrites--;
      const ind = root.querySelector("#save-indicator");
      if (ind && pendingWrites === 0) ind.textContent = t("savedIndicator");
    }
  };
  if (immediate) flush();
  else saveTimers[key] = setTimeout(flush, 600);
}

function onValueClick(itemId, value) {
  const current = session.answers[itemId] || {};
  const next = current.value === value ? { ...current, value: null } : { ...current, value };
  session.answers[itemId] = next;
  reRenderItem(itemId);
  scheduleSave(`item-${itemId}-value`, { [`answers.${itemId}.value`]: next.value ?? null }, true);
}

function onNoteInput(itemId, value) {
  session.answers[itemId] = { ...(session.answers[itemId] || {}), note: value };
  scheduleSave(`item-${itemId}-note`, { [`answers.${itemId}.note`]: value });
  refreshItemCompleteClass(itemId);
}

function refreshItemCompleteClass(itemId) {
  refreshProgressUI();
  const item = CHECKLIST_ITEMS_FLAT.find((it) => it.id === itemId);
  const el = document.getElementById(`item-${itemId}`);
  if (item && el) el.classList.toggle("complete", itemIsComplete(item, session.answers[itemId]));
}

async function onPhotoSelected(itemId, file) {
  const statusEl = document.getElementById(`upload-status-${itemId}`);
  if (statusEl) statusEl.textContent = t("uploadingPhoto");
  try {
    const blob = await compressImage(file);
    const path = `submissions/${session.docId}/item-${itemId}-${Date.now()}.jpg`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(ref);
    session.answers[itemId] = { ...(session.answers[itemId] || {}), photoUrl: url };
    scheduleSave(`item-${itemId}-photo`, { [`answers.${itemId}.photoUrl`]: url }, true);
    reRenderItem(itemId);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "";
    alert(err.message || String(err));
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("compress failed"))), "image/jpeg", 0.72);
    };
    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onSubmit() {
  const { done, total } = computeProgress();
  if (done < total) return;
  const submitBtn = root.querySelector("#btn-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = t("loadingButton");
  try {
    await updateDoc(doc(db, "submissions", session.docId), {
      submitted: true,
      submittedAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    });
    const flaggedCount = CHECKLIST_ITEMS_FLAT.filter((it) => session.answers[it.id]?.value === "no").length;
    renderConfirmScreen(flaggedCount);
  } catch (err) {
    console.error(err);
    alert(err.message || String(err));
    submitBtn.disabled = false;
    submitBtn.textContent = t("submitButton");
  }
}

function renderConfirmScreen(flaggedCount) {
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="confirm-screen">
        <div class="confirm-icon">✅</div>
        <h2>${t("submitConfirmTitle")}</h2>
        <p>${flaggedCount > 0 ? t("submitConfirmBody", { flagged: flaggedCount }) : t("submitConfirmBodyClean")}</p>
        <button class="btn btn-primary" id="btn-done">${t("startAnotherStore")}</button>
      </div>
    </main>
  `;
  wireLangToggle(() => renderConfirmScreen(flaggedCount));
  root.querySelector("#btn-done").addEventListener("click", () => {
    session = null;
    renderSetupScreen();
  });
}
