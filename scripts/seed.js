// Seed script: run with `node scripts/seed.js`.
// Populates one Panda-Express-style store, three peer managers (GM, AM,
// Chef -- AM and Chef intentionally have identical permission tier),
// the weekly operating rhythm from spec section 5, and cleaning areas.
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

function auditRow(entityType, entityId, actorId, action, newValue) {
  db.prepare(
    `INSERT INTO audit_events (id, entity_type, entity_id, actor_id, actor_role, pic_id, action, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)`
  ).run(id(), entityType, entityId, actorId, action, newValue ? JSON.stringify(newValue) : null, now());
}

// --- Store -------------------------------------------------------------
const storeId = id();
db.prepare(`INSERT INTO stores (id, name, timezone, language_default, created_at) VALUES (?, ?, ?, ?, ?)`).run(
  storeId,
  "Panda Express #2417",
  "America/Chicago",
  "en",
  now()
);

// --- Users ---------------------------------------------------------------
const PASSWORD = "shiftops123";
const passwordHash = bcrypt.hashSync(PASSWORD, 10);

function makeUser(name, email, position, language) {
  const uid = id();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, position, language, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(uid, name, email, passwordHash, position, language, now());
  db.prepare(
    `INSERT INTO store_memberships (id, user_id, store_id, role, active) VALUES (?, ?, ?, ?, 1)`
  ).run(id(), uid, storeId, position);
  return uid;
}

const gmId = makeUser("Jordan Ellis", "gm@shiftops.demo", "GM", "en");
const amId = makeUser("Priya Nair", "am@shiftops.demo", "ASSISTANT_MANAGER", "en");
const chefId = makeUser("Mateo Alvarez", "chef@shiftops.demo", "CHEF", "es");
const visitingId = makeUser("Sam Cole", "visiting@shiftops.demo", "VISITING_MANAGER", "en");

console.log("Login for every seeded manager uses password:", PASSWORD);
console.log("GM:", "gm@shiftops.demo");
console.log("AM:", "am@shiftops.demo");
console.log("Chef:", "chef@shiftops.demo (Spanish UI by default)");
console.log("Visiting Manager:", "visiting@shiftops.demo");

// --- Weekly recurring rhythm (spec section 5) -----------------------------
function tpl({ title, description, area, category, recurrenceType, config, effort, verify, checklistRole }) {
  const tId = id();
  db.prepare(
    `INSERT INTO task_templates (id, store_id, title, description, area, category, recurrence_type, recurrence_config,
      default_owner_position, effort, verification_required, source, active, checklist_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'spec_default', 1, ?, ?)`
  ).run(tId, storeId, title, description || null, area || null, category, recurrenceType, JSON.stringify(config || {}), effort, verify ? 1 : 0, checklistRole || null, now());
  return tId;
}

// Daily manager routine -- the first four are checked early in the shift
// (Opening Ready); the cleaning/acknowledgement review is due at 20:00, the
// natural end-of-day check (Closing Complete). See spec section 19's
// "configurable Opening Ready and Closing Complete summaries."
tpl({
  title: "Check WorkJam & action required items",
  category: "ROUTINE",
  recurrenceType: "DAILY",
  config: { dueTime: "10:00" },
  effort: "QUICK",
  checklistRole: "OPENING",
});
tpl({
  title: "Check Trends & complete/update required items",
  category: "ROUTINE",
  recurrenceType: "DAILY",
  config: { dueTime: "10:00" },
  effort: "QUICK",
  checklistRole: "OPENING",
});
tpl({
  title: "Review & approve Legion timesheets",
  category: "ROUTINE",
  recurrenceType: "DAILY",
  config: { dueTime: "12:00" },
  effort: "STANDARD",
  checklistRole: "OPENING",
});
tpl({
  title: "Review company email & convert follow-ups into tasks",
  category: "ROUTINE",
  recurrenceType: "DAILY",
  config: { dueTime: "11:00" },
  effort: "STANDARD",
  checklistRole: "OPENING",
});
tpl({
  title: "Review daily cleaning status & outstanding acknowledgements",
  category: "ROUTINE",
  recurrenceType: "DAILY",
  config: { dueTime: "20:00" },
  checklistRole: "CLOSING",
  effort: "QUICK",
});

// Monday
tpl({ title: "Receive truck", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [1], dueTime: "09:00" }, effort: "MAJOR", verify: true });
tpl({ title: "Place truck order", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [1], dueTime: "14:00" }, effort: "STANDARD" });

// Tuesday
const loomisTueId = tpl({ title: "Loomis change order", description: "Submit before 11:00 AM", category: "LOOMIS", recurrenceType: "WEEKLY", config: { weekdays: [2], dueTime: "11:00" }, effort: "QUICK" });
tpl({ title: "GEM call (conditional)", description: "9:00-10:00 AM, required only when weekly guest-expectation survey performance triggers it", category: "MEETING", recurrenceType: "WEEKLY", config: { weekdays: [2], dueTime: "10:00", conditionalMeetingType: "GEM_CALL" }, effort: "STANDARD" });
tpl({ title: "Area weekly meeting", description: "10:00-11:00 AM", category: "MEETING", recurrenceType: "WEEKLY", config: { weekdays: [2], dueTime: "11:00" }, effort: "STANDARD" });

// Wednesday
tpl({ title: "Receive truck", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [3], dueTime: "09:00" }, effort: "MAJOR", verify: true });
tpl({ title: "Place truck order", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [3], dueTime: "14:00" }, effort: "STANDARD" });
tpl({ title: "Complete & publish store schedule", description: "Must publish by 11:00 PM", category: "DEADLINE", recurrenceType: "WEEKLY", config: { weekdays: [3], dueTime: "23:00" }, effort: "MAJOR" });

// Thursday
tpl({ title: "Place truck order", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [4], dueTime: "14:00" }, effort: "STANDARD" });

// Friday
tpl({ title: "Receive truck", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [5], dueTime: "09:00" }, effort: "MAJOR", verify: true });
tpl({ title: "Place truck order", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [5], dueTime: "14:00" }, effort: "STANDARD" });

// Saturday
tpl({ title: "Receive truck", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [6], dueTime: "09:00" }, effort: "MAJOR", verify: true });
const satInventoryId = tpl({ title: "Complete night inventory", category: "INVENTORY", recurrenceType: "WEEKLY", config: { weekdays: [6], dueTime: "23:00" }, effort: "MAJOR", verify: true });

// Sunday
tpl({ title: "Loomis change order", description: "Submit before 11:00 AM", category: "LOOMIS", recurrenceType: "WEEKLY", config: { weekdays: [0], dueTime: "11:00" }, effort: "QUICK" });
tpl({ title: "Verify Saturday inventory & post", description: "Double-check Saturday inventory, correct if needed, then post.", category: "INVENTORY", recurrenceType: "WEEKLY", config: { weekdays: [0], dueTime: "12:00", dependsOnTemplateTitle: "Complete night inventory" }, effort: "STANDARD", verify: true });
tpl({ title: "Send weekly store numbers to SCO/crew", category: "ROUTINE", recurrenceType: "WEEKLY", config: { weekdays: [0], dueTime: "18:00" }, effort: "STANDARD" });

// --- Meetings (structured, separate from generic tasks) --------------------
db.prepare(`INSERT INTO meetings (id, store_id, type, weekday, start_time, end_time, conditional, required_state, created_at) VALUES (?, ?, 'GEM_CALL', 2, '09:00', '10:00', 1, 'REQUIRED', ?)`).run(id(), storeId, now());
db.prepare(`INSERT INTO meetings (id, store_id, type, weekday, start_time, end_time, conditional, required_state, created_at) VALUES (?, ?, 'AREA_WEEKLY', 2, '10:00', '11:00', 0, 'REQUIRED', ?)`).run(id(), storeId, now());

// --- Cleaning areas ----------------------------------------------------
function area(name, category, ownerId) {
  const aId = id();
  db.prepare(`INSERT INTO cleaning_areas (id, store_id, name, category, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(aId, storeId, name, category, ownerId, now());
  return aId;
}
const fohArea = area("FOH - Dining & Front Counter", "FOH", amId);
const bohArea = area("BOH - Cook Line & Prep", "BOH", chefId);
const facArea = area("Facilities / Exterior", "FACILITIES", gmId);

function cleaningTask(areaId, title, associateName, managerOwnerId, photoRequired) {
  db.prepare(
    `INSERT INTO cleaning_tasks (id, area_id, title, associate_name, manager_owner_id, status, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(id(), areaId, title, associateName, managerOwnerId, photoRequired ? 1 : 0, now());
}
cleaningTask(fohArea, "Dining room tables & floor", "Ana R.", amId, 0);
cleaningTask(fohArea, "Restrooms", "Ana R.", amId, 0);
cleaningTask(fohArea, "Beverage area", "Luis M.", amId, 0);
cleaningTask(bohArea, "Walk-in organization & temp check", "Diego F.", chefId, 1);
cleaningTask(bohArea, "Cook line deep wipe-down", "Diego F.", chefId, 0);
cleaningTask(bohArea, "Dish pit", "Kevin S.", chefId, 0);
cleaningTask(facArea, "Dumpster area", "Kevin S.", gmId, 0);
cleaningTask(facArea, "Perimeter / parking lot", "Luis M.", gmId, 0);

// --- Today's shift with GM as PIC, plus a couple of live example records ---
const today = new Date().toISOString().slice(0, 10);
const shiftId = id();
db.prepare(`INSERT INTO shifts (id, store_id, date, pic_user_id, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`).run(shiftId, storeId, today, gmId, now());

// Example open guest recovery awaiting approval
db.prepare(
  `INSERT INTO guest_recoveries (id, store_id, contact_channel, order_channel, issue_category, description, replacement_status, created_by, pic_id, created_at)
   VALUES (?, ?, 'PHONE', 'ONLINE', 'ACCURACY', 'Guest called about missing item on online order #48213.', 'PENDING', ?, ?, ?)`
).run(id(), storeId, amId, gmId, now());

// Example open borrowed item
db.prepare(
  `INSERT INTO borrowed_items (id, store_id, borrowed_from, item, quantity, unit, owner_id, status, created_by, created_at)
   VALUES (?, ?, 'Store #2205', 'White rice (cases)', 2, 'case', ?, 'OPEN', ?, ?)`
).run(id(), storeId, chefId, chefId, now());

// Example open issue
db.prepare(
  `INSERT INTO issues (id, store_id, category, description, severity, status, owner_id, created_by, created_at)
   VALUES (?, ?, 'EQUIPMENT', 'Walk-in freezer running warm, technician not yet scheduled.', 'CRITICAL', 'OPEN', ?, ?, ?)`
).run(id(), storeId, chefId, chefId, now());

// Example pending schedule request
db.prepare(
  `INSERT INTO schedule_requests (id, store_id, associate_name, request_type, requested_start_date, received_via, received_by, entered_by, notes, status, created_at)
   VALUES (?, ?, 'Ana R.', 'FULL_DAY_OFF', date('now', '+5 days'), 'TEXT', ?, ?, 'Family event', 'PENDING_GM_APPROVAL', ?)`
).run(id(), storeId, chefId, chefId, now());

console.log("Seed complete. Store:", storeId);
