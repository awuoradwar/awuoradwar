import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Local/dev persistence layer. Table shapes mirror supabase_schema.sql exactly
// so this module can be swapped for a Postgres/Supabase client later without
// changing any service code's SQL shape assumptions (see README for the swap).

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shift-ops.db");

declare global {
  var __shiftOpsDb: Database.Database | undefined;
}

/** Add a column to an already-existing table if it isn't there yet. schema.sql's
 * CREATE TABLE IF NOT EXISTS only covers brand-new tables -- a table that already
 * exists on disk never picks up newly-added columns from schema.sql on its own. */
function ensureColumn(db: Database.Database, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function createConnection(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf-8");
  db.exec(schema);
  ensureColumn(db, "cleaning_tasks", "description", "description TEXT");
  ensureColumn(db, "cleaning_tasks", "description_es", "description_es TEXT");
  ensureColumn(db, "cleaning_tasks", "weekday", "weekday INTEGER");
  ensureColumn(db, "store_pnl_periods", "gem_taste_score", "gem_taste_score REAL");
  ensureColumn(db, "store_pnl_periods", "gem_taste_goal", "gem_taste_goal REAL");
  ensureColumn(db, "store_pnl_periods", "gem_accuracy_score", "gem_accuracy_score REAL");
  ensureColumn(db, "store_pnl_periods", "gem_accuracy_goal", "gem_accuracy_goal REAL");
  ensureColumn(db, "guest_recoveries", "guest_name", "guest_name TEXT");
  ensureColumn(db, "inventory_items", "variant", "variant TEXT");
  ensureColumn(db, "inventory_items", "sort_order", "sort_order INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "inventory_items", "stock_count", "stock_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "inventory_items", "par_level", "par_level INTEGER");
  ensureColumn(db, "inventory_items", "on_order", "on_order INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "cleaning_tasks", "photo_before_url", "photo_before_url TEXT");
  ensureColumn(db, "cleaning_tasks", "photo_after_url", "photo_after_url TEXT");
  ensureColumn(db, "borrowed_items", "direction", "direction TEXT NOT NULL DEFAULT 'BORROWED'");
  ensureColumn(db, "borrowed_items", "approved_by_name", "approved_by_name TEXT");
  ensureColumn(db, "borrowed_items", "picked_up_by_name", "picked_up_by_name TEXT");
  ensureColumn(db, "borrowed_items", "picked_up_at", "picked_up_at TEXT");
  ensureColumn(db, "borrowed_items", "due_at", "due_at TEXT");
  ensureColumn(db, "attendance_events", "event_date", "event_date TEXT");
  ensureColumn(db, "stores", "gem_taste_score", "gem_taste_score REAL");
  ensureColumn(db, "stores", "gem_taste_goal", "gem_taste_goal REAL");
  ensureColumn(db, "stores", "gem_accuracy_score", "gem_accuracy_score REAL");
  ensureColumn(db, "stores", "gem_accuracy_goal", "gem_accuracy_goal REAL");
  ensureColumn(db, "stores", "gem_updated_by", "gem_updated_by TEXT REFERENCES users(id)");
  ensureColumn(db, "stores", "gem_updated_at", "gem_updated_at TEXT");
  ensureColumn(db, "store_pnl_periods", "restaurant_contribution_pct", "restaurant_contribution_pct REAL");
  ensureColumn(db, "store_pnl_periods", "released_at", "released_at TEXT");
  ensureColumn(db, "tasks", "owner_auto_assigned", "owner_auto_assigned INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "attendance_events", "notified_at", "notified_at TEXT");
  ensureColumn(db, "attendance_events", "notification_method", "notification_method TEXT");
  ensureColumn(db, "attendance_events", "attachment_ref", "attachment_ref TEXT");
  migrateLegacyTrainingPositions(db);
  backfillCurrentGemFromLatestPeriod(db);
  unassignStaleAutoAssignedTasks(db);
  return db;
}

/** Recurring task instances used to auto-resolve their owner from the
 * schedule at creation time; now they default to unassigned instead (a
 * manager assigns on the day of, if needed) unless a template explicitly
 * opts back in. That code change alone doesn't touch rows that already
 * materialized under the old behavior -- ensureInstancesForDate only ever
 * inserts a new row for a template+date that doesn't already have one, so
 * an already-generated instance for today or later this week keeps
 * whatever owner it was auto-assigned at the time, forever, without this.
 * One-time, idempotent: only ever matches owner_auto_assigned = 1, which
 * this clears to 0 -- a no-op on every boot after the first. */
function unassignStaleAutoAssignedTasks(db: Database.Database) {
  db.prepare(
    `UPDATE tasks SET owner_id = NULL, owner_auto_assigned = 0
     WHERE owner_auto_assigned = 1 AND source = 'recurring' AND status IN ('OPEN', 'IN_PROGRESS')`
  ).run();
}

/** GEM used to live on the most recent P&L period row -- moved to a single
 * current value on the store itself (see stores.gem_* above) since GEM
 * updates far more often than a period does. One-time, idempotent: only
 * fills a store's current GEM if it's still unset, from whichever of that
 * store's periods most recently had a GEM score on it. Safe to run on every
 * boot -- a no-op once every store has its own current value. */
function backfillCurrentGemFromLatestPeriod(db: Database.Database) {
  const stores = db.prepare(`SELECT id FROM stores WHERE gem_taste_score IS NULL AND gem_accuracy_score IS NULL`).all() as Array<{ id: string }>;
  for (const store of stores) {
    const period = db
      .prepare(
        `SELECT gem_taste_score, gem_taste_goal, gem_accuracy_score, gem_accuracy_goal FROM store_pnl_periods
         WHERE store_id = ? AND (gem_taste_score IS NOT NULL OR gem_accuracy_score IS NOT NULL)
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(store.id) as { gem_taste_score: number | null; gem_taste_goal: number | null; gem_accuracy_score: number | null; gem_accuracy_goal: number | null } | undefined;
    if (!period) continue;
    db.prepare(`UPDATE stores SET gem_taste_score = ?, gem_taste_goal = ?, gem_accuracy_score = ?, gem_accuracy_goal = ? WHERE id = ?`).run(
      period.gem_taste_score,
      period.gem_taste_goal,
      period.gem_accuracy_score,
      period.gem_accuracy_goal,
      store.id
    );
  }
}

/** Training positions started as FOH/BOH, then split into COUNTERHELP/COOK/
 * KITCHENHELP (Cook and Kitchenhelp are distinct real positions). Any
 * trainee or checklist item created under the old scheme would otherwise
 * point at a position no label/checklist recognizes -- BOH maps to COOK as
 * a reasonable default; a GM can move a specific trainee to Kitchenhelp by
 * hand if that's what was actually meant. Idempotent: a second run is a
 * no-op once no rows carry the old values. */
function migrateLegacyTrainingPositions(db: Database.Database) {
  for (const table of ["training_items", "trainees"]) {
    db.prepare(`UPDATE ${table} SET position = 'COUNTERHELP' WHERE position = 'FOH'`).run();
    db.prepare(`UPDATE ${table} SET position = 'COOK' WHERE position = 'BOH'`).run();
  }
}

export function getDb(): Database.Database {
  if (!global.__shiftOpsDb) {
    global.__shiftOpsDb = createConnection();
  }
  return global.__shiftOpsDb;
}
