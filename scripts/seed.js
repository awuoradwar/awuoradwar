// Seed script: run with `node scripts/seed.js`.
// This file is a generic engine only -- it contains no store-specific
// wording, procedure names, or schedules. All of that lives in a content
// pack under scripts/store-content/ (plain data, not code); this script
// just reads one and inserts it. Point SEED_CONTENT_PACK at a different
// file (by path, absolute or relative to scripts/store-content/) to seed a
// different store's real content without touching this file.
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "shift-ops.db");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Fresh seed every run so the demo is reproducible.
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
for (const suffix of ["-wal", "-shm"]) {
  const f = DB_PATH + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "..", "src", "lib", "schema.sql"), "utf-8"));

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const contentPackPath = process.env.SEED_CONTENT_PACK
  ? path.resolve(process.cwd(), process.env.SEED_CONTENT_PACK)
  : path.join(__dirname, "store-content", "panda-express-2417.js");
const content = require(contentPackPath);

// --- Store -----------------------------------------------------------------
const storeId = id();
db.prepare(`INSERT INTO stores (id, name, timezone, language_default, created_at) VALUES (?, ?, ?, ?, ?)`).run(
  storeId,
  content.store.name,
  content.store.timezone,
  content.store.languageDefault,
  now()
);

// --- Users -------------------------------------------------------------
const PASSWORD = "shiftops123";
const passwordHash = bcrypt.hashSync(PASSWORD, 10);
const emailToId = {};

for (const u of content.users) {
  const uid = id();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, position, language, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(uid, u.name, u.email, passwordHash, u.position, u.language, now());
  db.prepare(`INSERT INTO store_memberships (id, user_id, store_id, role, active) VALUES (?, ?, ?, ?, 1)`).run(id(), uid, storeId, u.position);
  emailToId[u.email] = uid;
}

console.log("Login for every seeded manager uses password:", PASSWORD);
for (const u of content.users) console.log(`${u.position}:`, u.email);

// --- Task templates ----------------------------------------------------
function tpl({ title, titleEs, description, area, category, recurrenceType, config, effort, verify, checklistRole }) {
  const tId = id();
  db.prepare(
    `INSERT INTO task_templates (id, store_id, title, title_es, description, area, category, recurrence_type, recurrence_config,
      default_owner_position, effort, verification_required, source, active, checklist_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'spec_default', 1, ?, ?)`
  ).run(tId, storeId, title, titleEs || null, description || null, area || null, category, recurrenceType, JSON.stringify(config || {}), effort, verify ? 1 : 0, checklistRole || null, now());
  return tId;
}
for (const t of content.taskTemplates) tpl(t);

// --- Meetings (structured, separate from generic tasks) --------------------
for (const m of content.meetings || []) {
  db.prepare(
    `INSERT INTO meetings (id, store_id, type, weekday, start_time, end_time, conditional, required_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id(), storeId, m.type, m.weekday, m.startTime, m.endTime, m.conditional ? 1 : 0, m.requiredState, now());
}

// --- Cleaning areas & tasks ----------------------------------------------
function area(name, nameEs, category, ownerId) {
  const aId = id();
  db.prepare(`INSERT INTO cleaning_areas (id, store_id, name, name_es, category, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(aId, storeId, name, nameEs || null, category, ownerId, now());
  return aId;
}
function cleaningTask(areaId, title, titleEs, frequency, associateName, managerOwnerId, photoRequired, description, weekday) {
  db.prepare(
    `INSERT INTO cleaning_tasks (id, area_id, title, title_es, description, frequency, weekday, associate_name, manager_owner_id, status, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(id(), areaId, title, titleEs || null, description || null, frequency, weekday ?? null, associateName || null, managerOwnerId, photoRequired ? 1 : 0, now());
}

const areaKeyToId = {};
for (const a of content.cleaningAreas || []) {
  areaKeyToId[a.key] = area(a.name, a.nameEs, a.category, emailToId[a.ownerEmail]);
}
for (const t of content.cleaningTasks || []) {
  cleaningTask(areaKeyToId[t.areaKey], t.title, t.titleEs, t.frequency, t.associateName, emailToId[t.managerOwnerEmail], t.photoRequired);
}

// Weekly deep-clean rotation: one FOH + one BOH area per weekday, each with
// its own single task carrying the full checklist as its description. Reuses
// the same owners as the base "foh"/"boh" cleaning areas above.
const fohOwnerId = emailToId[content.cleaningAreas?.find((a) => a.key === "foh")?.ownerEmail] || null;
const bohOwnerId = emailToId[content.cleaningAreas?.find((a) => a.key === "boh")?.ownerEmail] || null;
for (const day of content.deepCleanRotation || []) {
  const fohArea = area(day.foh.name, null, "FOH", fohOwnerId);
  cleaningTask(fohArea, day.foh.title, null, "WEEKLY", null, fohOwnerId, false, day.foh.description, day.weekday);
  const bohArea = area(day.boh.name, null, "BOH", bohOwnerId);
  cleaningTask(bohArea, day.boh.title, null, "WEEKLY", null, bohOwnerId, false, day.boh.description, day.weekday);
}

// --- Today's shift with GM as PIC, plus a couple of live example records ---
const gmEmail = content.users.find((u) => u.position === "GM")?.email;
const today = new Date().toISOString().slice(0, 10);
const shiftId = id();
db.prepare(`INSERT INTO shifts (id, store_id, date, pic_user_id, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`).run(shiftId, storeId, today, emailToId[gmEmail], now());

const ex = content.exampleRecords || {};
if (ex.guestRecovery) {
  const r = ex.guestRecovery;
  db.prepare(
    `INSERT INTO guest_recoveries (id, store_id, contact_channel, order_channel, issue_category, description, replacement_status, created_by, pic_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id(), storeId, r.contactChannel, r.orderChannel, r.issueCategory, r.description, r.replacementStatus, emailToId[r.createdByEmail], emailToId[r.picEmail], now());
}
if (ex.borrowedItem) {
  const r = ex.borrowedItem;
  db.prepare(
    `INSERT INTO borrowed_items (id, store_id, borrowed_from, item, quantity, unit, owner_id, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id(), storeId, r.borrowedFrom, r.item, r.quantity, r.unit, emailToId[r.ownerEmail], r.status, emailToId[r.createdByEmail], now());
}
if (ex.issue) {
  const r = ex.issue;
  db.prepare(
    `INSERT INTO issues (id, store_id, category, description, severity, status, owner_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id(), storeId, r.category, r.description, r.severity, r.status, emailToId[r.ownerEmail], emailToId[r.createdByEmail], now());
}
if (ex.scheduleRequest) {
  const r = ex.scheduleRequest;
  const requestedStart = new Date(Date.now() + (r.requestedStartDateOffsetDays || 0) * 86400000).toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO schedule_requests (id, store_id, associate_name, request_type, requested_start_date, received_via, received_by, entered_by, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id(), storeId, r.associateName, r.requestType, requestedStart, r.receivedVia, emailToId[r.receivedByEmail], emailToId[r.enteredByEmail], r.notes, r.status, now());
}

console.log("Seed complete. Store:", storeId);
