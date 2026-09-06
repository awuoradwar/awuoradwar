import {
  auth,
  db,
  signInAnonymously,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  where,
  query,
  getDocs,
  serverTimestamp,
} from "./firebase-init.js";

let initialized = false;
let root;
let stores = [];
let storesLoaded = false;

// Current in-progress submission, once a walkthrough is started.
let session = null; // { docId, storeNumber, storeName, conductedBy, answers, additionalNotes }
let pendingWrites = 0;
const saveTimers = {};

// Which checklist section is currently expanded (accordion — only one
// open at a time). Set to the first incomplete section whenever a
// walkthrough starts/resumes; null means every section is complete.
let expandedSectionId = null;

export async function initAssociateApp() {
  if (initialized) return;
  initialized = true;
  root = document.getElementById("associate-root");
  renderSetupScreen();

  // Reading the store list requires being signed in (even anonymously) —
  // has to happen before subscribing, not just before "Start Walkthrough",
  // or the very first read is rejected and the dropdown never populates.
  await ensureAuth();

  onSnapshot(query(collection(db, "stores")), (snap) => {
    // number is a string field, so Firestore's own ordering would sort it
    // lexicographically ("100" before "99") — sort numerically instead.
    stores = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => Number(a.number) - Number(b.number));
    storesLoaded = true;
    if (!session) renderSetupScreen();
  });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Stores can be number-only — a name is optional, not every store has (or
// needs) a descriptive one.
function storeLabel(number, name) {
  return name ? `${number} — ${name}` : String(number);
}

// Type-to-filter store picker — see the identical helper in admin.js for
// the full rationale. Here valueKey is "id" since the setup screen looks
// stores up by store.id, not by number.
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
  root.innerHTML = `
    ${topBarHtml()}
    <main>
      <div class="card">
        <div class="field">
          <label>${t("storeLabel")}</label>
          ${
            storesLoaded && stores.length === 0
              ? `<div class="hint-banner">${t("noStoresConfigured")}</div>`
              : `<div class="store-combo">
                  <input type="text" id="store-select-input" autocomplete="off" placeholder="${t("storeSelectPlaceholder")}" ${storesLoaded ? "" : "disabled"} />
                  <input type="hidden" id="store-select" value="" />
                  <div class="store-combo-list" id="store-select-list" hidden></div>
                </div>`
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
    wireStoreCombo({
      inputEl: root.querySelector("#store-select-input"),
      hiddenEl: storeSelect,
      listEl: root.querySelector("#store-select-list"),
      stores,
      allLabel: "",
      valueKey: "id",
      onSelect: () => {
        refreshStartEnabled();
        renderWeeklyToggle(false);
      },
    });
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

// Photos live in a subcollection (submissions/{docId}/photos/{itemId}),
// each holding its own base64 image — never in Cloud Storage, which
// requires a billing account even for free-tier usage. The parent
// submission doc only carries a lightweight `hasPhoto` flag per item, so
// hydrate the actual image data back onto `answers[id].photoUrl` when
// resuming a draft or reopening an already-submitted day.
async function hydratePhotoUrls(docId, answers) {
  const merged = { ...answers };
  try {
    const snap = await getDocs(collection(db, "submissions", docId, "photos"));
    snap.forEach((d) => {
      const id = Number(d.id);
      if (merged[id]) merged[id] = { ...merged[id], photoUrl: d.data().dataUrl };
    });
  } catch (err) {
    console.error("failed to load photos", err);
  }
  return merged;
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
  let answers;
  if (snap.exists()) {
    data = snap.data();
    answers = await hydratePhotoUrls(docId, data.answers || {});
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
    answers = {};
  }

  session = {
    docId,
    storeNumber: store.number,
    storeName: store.name,
    conductedBy: data.conductedBy || conductedBy,
    answers,
    additionalNotes: data.additionalNotes || "",
  };
  expandedSectionId = firstIncompleteSectionId();
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
  root.querySelector("#btn-edit-anyway").addEventListener("click", async () => {
    session = {
      docId,
      storeNumber: store.number,
      storeName: store.name,
      conductedBy: data.conductedBy,
      answers: await hydratePhotoUrls(docId, data.answers || {}),
      additionalNotes: data.additionalNotes || "",
    };
    expandedSectionId = firstIncompleteSectionId();
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
    return item.alwaysPhoto ? Boolean(answer.hasPhoto) : true;
  }
  // "no"
  const needsPhoto = item.alwaysPhoto || item.requiresPhoto;
  if (needsPhoto && !answer.hasPhoto) return false;
  return Boolean(answer.note && answer.note.trim());
}

function sectionItems(sectionId) {
  return CHECKLIST_ITEMS_FLAT.filter((it) => it.sectionId === sectionId);
}

function isSectionComplete(sectionId) {
  return sectionItems(sectionId).every((it) => itemIsComplete(it, session.answers[it.id]));
}

function firstIncompleteSectionId() {
  for (const group of CHECKLIST_GROUPS) {
    for (const section of group.sections) {
      if (!isSectionComplete(section.id)) return section.id;
    }
  }
  return null;
}

// Only meaningful right after an answer changes: if that item's section
// is the one currently open and it just became fully complete, collapse
// it and open the next incomplete section (or none, if that was the
// last one) — the guided, one-section-at-a-time flow.
function maybeAdvanceSection(itemId) {
  const item = CHECKLIST_ITEMS_FLAT.find((it) => it.id === itemId);
  if (!item || item.sectionId !== expandedSectionId || !isSectionComplete(item.sectionId)) return;
  expandedSectionId = firstIncompleteSectionId();
  renderChecklistScreen();
  if (expandedSectionId) {
    document.querySelector(`[data-section-block="${expandedSectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function jumpToFirstIncomplete() {
  const item = CHECKLIST_ITEMS_FLAT.find((it) => !itemIsComplete(it, session.answers[it.id]));
  if (!item) return;
  expandedSectionId = item.sectionId;
  renderChecklistScreen();
  const row = document.getElementById(`item-${item.id}`);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("jump-highlight");
    setTimeout(() => row.classList.remove("jump-highlight"), 1600);
  }
}

function renderSectionBlock(section) {
  const done = section.items.filter((it) => itemIsComplete(it, session.answers[it.id])).length;
  const total = section.items.length;
  const complete = done === total;
  const expanded = expandedSectionId === section.id;
  return `
    <div class="section-block" data-section-block="${section.id}">
      <button type="button" class="section-toggle" data-section="${section.id}">
        <span class="section-chevron">${expanded ? "▾" : "▸"}</span>
        <span class="section-name">${escapeHtml(tf(section))}</span>
        <span class="badge ${complete ? "badge-success" : "badge-neutral"}">${complete ? "✓" : `${done}/${total}`}</span>
      </button>
      <div class="section-body ${expanded ? "" : "collapsed"}">
        ${section.items.map((item) => renderItemRow(item)).join("")}
      </div>
    </div>`;
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
      <div class="photo-row" id="photo-row-${item.id}">
        ${photoUrl ? `<img class="photo-thumb" src="${photoUrl}" alt="" data-lightbox="${photoUrl}" />` : ""}
        <label class="file-btn btn btn-secondary btn-sm">
          <span>${photoUrl ? t("retakePhoto") : t("takePhoto")}</span>
          <input type="file" accept="image/*" class="photo-input" data-item="${item.id}" />
        </label>
      </div>`
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

function openLightbox(url) {
  const backdrop = document.createElement("div");
  backdrop.className = "lightbox-backdrop";
  backdrop.innerHTML = `<button type="button" class="lightbox-close" aria-label="${escapeHtml(t("closeButton"))}">&times;</button><img src="${url}" alt="" />`;
  backdrop.addEventListener("click", () => backdrop.remove());
  document.body.appendChild(backdrop);
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
      body += renderSectionBlock(section);
    }
  }

  root.innerHTML = `
    ${topBarHtml()}
    <main id="checklist-body">
      <div class="card">
        <strong>${escapeHtml(storeLabel(session.storeNumber, session.storeName))}</strong>
        <div style="color:var(--text-muted); font-size:13px;">${escapeHtml(session.conductedBy)} · ${formatDateTime()}</div>
      </div>
      ${body}
      <div class="card">
        <label>${t("additionalNotesLabel")}</label>
        <textarea id="additional-notes" placeholder="${escapeHtml(t("additionalNotesPlaceholder"))}">${escapeHtml(session.additionalNotes)}</textarea>
      </div>
    </main>
    <div class="sticky-footer">
      <div class="progress-row">
        <div class="progress-track" style="flex:1;"><div class="progress-fill" id="progress-fill"></div></div>
        <span id="progress-label"></span>
        <span class="save-indicator" id="save-indicator"></span>
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
    const thumb = e.target.closest("img[data-lightbox]");
    if (thumb) openLightbox(thumb.dataset.lightbox);
    const toggle = e.target.closest("button.section-toggle");
    if (toggle) {
      const sid = toggle.dataset.section;
      expandedSectionId = expandedSectionId === sid ? null : sid;
      renderChecklistScreen();
    }
  });
  body_.addEventListener("change", (e) => {
    const fileInput = e.target.closest("input.photo-input");
    if (fileInput && fileInput.files[0]) onPhotoSelected(Number(fileInput.dataset.item), fileInput.files[0]);
  });
  body_.addEventListener("input", (e) => {
    const ta = e.target.closest("textarea.note-input");
    if (ta) onNoteInput(Number(ta.dataset.item), ta.value);
  });
  // Checking for section completion on every keystroke would re-render
  // mid-typing and steal focus — only check once they tap away.
  body_.addEventListener("focusout", (e) => {
    const ta = e.target.closest("textarea.note-input");
    if (ta) maybeAdvanceSection(Number(ta.dataset.item));
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
  if (submitBtn) submitBtn.classList.toggle("is-incomplete", done < total);
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
  maybeAdvanceSection(itemId);
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
  // Optimistic: show the photo instantly from a local object URL so the
  // tap feels immediate, while the compress+upload happens in the
  // background. reRenderItem() below (success or failure) replaces this
  // element entirely, so the temporary URL is safe to revoke right after.
  const localUrl = URL.createObjectURL(file);
  const row = document.getElementById(`photo-row-${itemId}`);
  if (row) {
    let img = row.querySelector(".photo-thumb");
    if (!img) {
      img = document.createElement("img");
      img.className = "photo-thumb";
      img.alt = "";
      row.prepend(img);
    }
    img.src = localUrl;
    const label = row.querySelector(".file-btn span");
    if (label) label.textContent = t("uploadingPhoto");
  }
  try {
    const dataUrl = await compressImage(file);
    await setDoc(doc(db, "submissions", session.docId, "photos", String(itemId)), {
      dataUrl,
      updatedAt: serverTimestamp(),
    });
    session.answers[itemId] = { ...(session.answers[itemId] || {}), photoUrl: dataUrl, hasPhoto: true };
    scheduleSave(`item-${itemId}-photo`, { [`answers.${itemId}.hasPhoto`]: true }, true);
    reRenderItem(itemId);
    maybeAdvanceSection(itemId);
  } catch (err) {
    console.error(err);
    alert(err.message || String(err));
    reRenderItem(itemId);
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}

// Resolves a compressed JPEG as a data: URL (not a Blob) — it's written
// straight into a Firestore field, never uploaded anywhere. Quality 0.6
// at up to 1280px wide keeps a typical photo well under ~250 KB even
// after base64's ~33% size overhead, comfortably inside Firestore's
// 1 MiB per-document limit with room to spare.
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
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onSubmit() {
  const { done, total } = computeProgress();
  if (done < total) {
    jumpToFirstIncomplete();
    return;
  }
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
