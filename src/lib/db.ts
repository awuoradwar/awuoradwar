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
  migrateLegacyTrainingPositions(db);
  return db;
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
