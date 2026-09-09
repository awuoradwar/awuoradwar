import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
  ensureColumn(db, "training_sessions", "notes", "notes TEXT");
  ensureColumn(db, "training_completions", "notes", "notes TEXT");
  ensureColumn(db, "training_completions", "shift_type", "shift_type TEXT");
  ensureColumn(db, "store_pnl_periods", "cogs_theoretical_pct", "cogs_theoretical_pct REAL");
  ensureColumn(db, "schedule_requests", "swap_with_name", "swap_with_name TEXT");
  ensureColumn(db, "schedule_requests", "swap_with_date", "swap_with_date TEXT");
  ensureColumn(db, "training_items", "phase", "phase TEXT NOT NULL DEFAULT 'SHIFT'");
  ensureColumn(db, "shift_notes", "title", "title TEXT");
  ensureColumn(db, "shift_notes", "sections_json", "sections_json TEXT");
  ensureColumn(db, "tasks", "title_es", "title_es TEXT");
  ensureColumn(db, "tasks", "description_es", "description_es TEXT");
  ensureColumn(db, "shift_notes", "title_es", "title_es TEXT");
  ensureColumn(db, "cleaning_tasks", "last_due_date", "last_due_date TEXT");
  ensureColumn(db, "shift_notes", "remind_day_before", "remind_day_before INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "stores", "org_id", "org_id TEXT REFERENCES franchise_orgs(id)");
  ensureColumn(db, "tasks", "handoff_note", "handoff_note TEXT");
  ensureColumn(db, "catering_orders", "paid", "paid INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "stores", "procedures_token", "procedures_token TEXT");
  ensureColumn(db, "manager_activities", "start_time", "start_time TEXT");
  ensureColumn(db, "manager_activities", "end_time", "end_time TEXT");
  relaxWasteLogPriceRequired(db);
  migrateLegacyTrainingPositions(db);
  backfillCurrentGemFromLatestPeriod(db);
  unassignStaleAutoAssignedTasks(db);
  splitWeeklyOpsSummaries(db);
  backfillDefaultFranchiseOrg(db);
  seedFohClosingProcedures(db);
  backfillFohClosingTranslations(db);
  return db;
}

/** Front of House closing checklist, transcribed from the store's own
 * paper close-out sheets -- each station worded as a post-clean
 * verification ("X is done") rather than an instruction, since the whole
 * point is a closer confirming coverage after cleaning, not being told
 * what to do. Seeded into every store's existing procedure_areas/
 * procedure_items tables (see procedureService.ts) rather than a parallel
 * schema -- it's the same FOH-category/CLOSING-shift shape the Procedures
 * feature already supports, just content instead of code. A GM can still
 * reword, add to, or add whole new stations afterward from the Procedures
 * management page. */
interface FohClosingItem {
  en: string;
  es: string;
}

const FOH_CLOSING_STATIONS: Array<{ name: string; items: FohClosingItem[] }> = [
  {
    name: "Lobby",
    items: [
      { en: "Tables are wiped down", es: "Las mesas están limpias" },
      { en: "Floor is swept and mopped twice", es: "El piso está barrido y trapeado dos veces" },
      { en: "Area behind the trash can is swept", es: "El área detrás del bote de basura está barrida" },
      { en: "Trash is taken out", es: "La basura está sacada" },
      { en: "Black trays are clean and placed up front", es: "Las charolas negras están limpias y colocadas al frente" },
      { en: "Patio chairs and cones are brought inside", es: "Las sillas del patio y los conos están guardados adentro" },
    ],
  },
  {
    name: "Drink Station",
    items: [
      { en: "Teas are cleaned with soap (no harsh chemicals)", es: "Los tés están limpios con jabón (sin químicos fuertes)" },
      { en: "Tea nozzles and station are cleaned", es: "Las boquillas de té y la estación están limpias" },
      { en: "All area is restocked", es: "Toda el área está reabastecida" },
      { en: "Area is wiped down", es: "El área está limpia" },
      { en: "Soda nozzles are left soaking", es: "Las boquillas de soda están remojando" },
      { en: "Soda area and wall are wiped down", es: "El área de soda y la pared están limpias" },
      { en: "Trash is taken out", es: "La basura está sacada" },
      { en: "DST cabinets are polished", es: "Los gabinetes del DST están pulidos" },
    ],
  },
  {
    name: "Refreshers",
    items: [
      { en: "All remaining juices are stored in the walk-in cooler", es: "Todos los jugos restantes están guardados en el walk-in" },
      { en: "All containers are cleaned with soap", es: "Todos los contenedores están limpios con jabón" },
      { en: "Station is cleaned and wiped down", es: "La estación está limpia" },
      { en: "Cups and lids are restocked", es: "Los vasos y las tapas están reabastecidos" },
      { en: "Ice container is wiped down and stored in the freezer", es: "El contenedor de hielo está limpio y guardado en el congelador" },
      { en: "Drain container is cleaned", es: "El contenedor del drenaje está limpio" },
    ],
  },
  {
    name: "OLO Restocker",
    items: [
      { en: "Windows and doors are cleaned", es: "Las ventanas y las puertas están limpias" },
      { en: "All sauces are neatly restocked", es: "Todas las salsas están reabastecidas ordenadamente" },
      { en: "Cookie bags and the Panda plushie up front are restocked", es: "Las bolsas de galletas y el peluche de Panda al frente están reabastecidos" },
      { en: "Register area is wiped down and clean", es: "El área de la caja está limpia" },
      { en: "Utensils and cookie drawer are restocked", es: "Los utensilios y el cajón de galletas están reabastecidos" },
      { en: "Apple crisp and chopsticks are restocked", es: "El apple crisp y los palillos están reabastecidos" },
    ],
  },
  {
    name: "Drive Thru Register",
    items: [
      {
        en: "Sauces, drive-thru fridge, drink station, utensils, plates, and containers are restocked",
        es: "Las salsas, el refrigerador del drive-thru, la estación de bebidas, los utensilios, los platos y los contenedores están reabastecidos",
      },
      { en: "Register area is wiped down", es: "El área de la caja está limpia" },
      { en: "Window and register screen are cleaned", es: "La ventana y la pantalla de la caja están limpias" },
      {
        en: "Steam table, walls, sink area, and drink station cabinets are wiped down",
        es: "La mesa de vapor, las paredes, el área del fregadero y los gabinetes de la estación de bebidas están limpios",
      },
      { en: "Window is turned off and locked at 11:00 PM", es: "La ventana está apagada y cerrada con llave a las 11:00 PM" },
      { en: "Teas are cleaned", es: "Los tés están limpios" },
      { en: "Soda nozzles are removed and left soaking", es: "Las boquillas de soda están quitadas y remojando" },
      { en: "Ice is melted and the ice container is cleaned", es: "El hielo está derretido y el contenedor de hielo está limpio" },
      { en: "Floors are swept", es: "Los pisos están barridos" },
      { en: "Floors are scrubbed with soapy water", es: "Los pisos están tallados con agua jabonosa" },
      { en: "Floors are squeegeed with clean water", es: "Los pisos están jalados con agua limpia" },
      { en: "Drains are cleaned out and filled with ice overnight", es: "Los drenajes están limpios y llenos de hielo durante la noche" },
    ],
  },
  {
    name: "Drive Thru Runner",
    items: [
      { en: "All rings are pulled and cleaned by 9:00 PM", es: "Todos los aros están sacados y limpios antes de las 9:00 PM" },
      { en: "Steam table is clean", es: "La mesa de vapor está limpia" },
      { en: "Glass is clean", es: "El vidrio está limpio" },
      { en: "Steam table is restocked", es: "La mesa de vapor está reabastecida" },
      { en: "Rice cooker is cleaned", es: "La arrocera está limpia" },
      { en: "Reach-in cooler counter is polished", es: "El mostrador del reach-in está pulido" },
      { en: "Pans and spoons are cleaned and assembled", es: "Las charolas y las cucharas están limpias y armadas" },
      { en: "Black line counter is clean", es: "El mostrador de la línea negra está limpio" },
      { en: "Underneath the steam table is cleaned", es: "Debajo de la mesa de vapor está limpio" },
      { en: "OLO shelf is cleaned", es: "El estante del OLO está limpio" },
    ],
  },
  {
    name: "Patio",
    items: [
      { en: "Cones and the menu sign are brought inside", es: "Los conos y el letrero del menú están guardados adentro" },
      { en: "Chairs are stacked", es: "Las sillas están apiladas" },
      { en: "Tables are clean", es: "Las mesas están limpias" },
      {
        en: "Trash is taken out, leaving 2 clean bags in the speaker trash can",
        es: "La basura está sacada, dejando 2 bolsas limpias en el bote de basura de la bocina",
      },
      { en: "Menu sign near the speaker is cleaned", es: "El letrero del menú cerca de la bocina está limpio" },
    ],
  },
  {
    name: "Bathrooms",
    items: [
      { en: "Toilet seat and base are cleaned with bleach", es: "El asiento y la base del inodoro están limpios con cloro" },
      { en: "Sink and mirror are wiped down with Spic n Span", es: "El lavabo y el espejo están limpios con Spic n Span" },
      { en: "Everything is restocked", es: "Todo está reabastecido" },
      { en: "Stalls are polished", es: "Los compartimentos están pulidos" },
      { en: "Floor is swept and mopped", es: "El piso está barrido y trapeado" },
      { en: "Trash is taken out", es: "La basura está sacada" },
    ],
  },
];

/** Per-station idempotent: checks each station individually rather than
 * gating on the whole set existing, so adding a new station to this array
 * (Patio and Bathrooms came after the original six) reaches every store
 * that already ran this seed, not just brand-new ones -- each store only
 * ever gets whichever named stations it doesn't already have. */
function seedFohClosingProcedures(db: Database.Database) {
  const stores = db.prepare(`SELECT id FROM stores`).all() as Array<{ id: string }>;
  if (stores.length === 0) return;

  const areaExists = db.prepare(`SELECT 1 FROM procedure_areas WHERE store_id = ? AND category = 'FOH' AND name = ?`);
  const insertArea = db.prepare(
    `INSERT INTO procedure_areas (id, store_id, name, category, sort_order, active, created_at) VALUES (?, ?, ?, 'FOH', ?, 1, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO procedure_items (id, area_id, shift_type, text, text_es, sort_order, active, created_at) VALUES (?, ?, 'CLOSING', ?, ?, ?, 1, ?)`
  );

  for (const store of stores) {
    FOH_CLOSING_STATIONS.forEach((station, areaIndex) => {
      if (areaExists.get(store.id, station.name)) return;
      const areaId = randomUUID();
      const now = new Date().toISOString();
      insertArea.run(areaId, store.id, station.name, areaIndex, now);
      station.items.forEach((item, itemIndex) => {
        insertItem.run(randomUUID(), areaId, item.en, item.es, itemIndex, now);
      });
    });
  }
}

/** seedFohClosingProcedures originally inserted these items with no Spanish
 * text (text_es NULL), so a store that already ran that seed before
 * translations were added here would see the checklist stay in English even
 * with the app set to Español. One-time, idempotent: matches existing rows
 * by their exact English text and only fills text_es where it's still NULL
 * -- a GM who has since reworded an item (see the Procedures edit UI) no
 * longer matches the original English text and is left alone. */
function backfillFohClosingTranslations(db: Database.Database) {
  const stmt = db.prepare(`UPDATE procedure_items SET text_es = ? WHERE text = ? AND text_es IS NULL`);
  for (const station of FOH_CLOSING_STATIONS) {
    for (const item of station.items) {
      stmt.run(item.es, item.en);
    }
  }
}

/** Every store needs an org_id once franchise_orgs exists, even a store that
 * was created back when there was no concept of one. Groups every org-less
 * store into a single default org (named after the first one alphabetically,
 * since that's the only store that exists for most installs) rather than
 * leaving org_id NULL -- a rollup view across "every store in my org" would
 * otherwise silently miss pre-existing stores. One-time, idempotent: a
 * no-op once every store already has an org_id. */
function backfillDefaultFranchiseOrg(db: Database.Database) {
  const orgless = db.prepare(`SELECT id, name FROM stores WHERE org_id IS NULL ORDER BY name`).all() as Array<{ id: string; name: string }>;
  if (orgless.length === 0) return;
  let org = db.prepare(`SELECT id FROM franchise_orgs ORDER BY created_at ASC LIMIT 1`).get() as { id: string } | undefined;
  if (!org) {
    const id = randomUUID();
    db.prepare(`INSERT INTO franchise_orgs (id, name, created_at) VALUES (?, ?, ?)`).run(id, `${orgless[0].name} Group`, new Date().toISOString());
    org = { id };
  }
  const placeholders = orgless.map(() => "?").join(",");
  db.prepare(`UPDATE stores SET org_id = ? WHERE id IN (${placeholders})`).run(org.id, ...orgless.map((s) => s.id));
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

/** price_per_unit on waste_log_entries started out required, then became
 * optional -- a manager logging waste often doesn't know the exact per-unit
 * cost off the top of their head. SQLite can't drop a NOT NULL with a plain
 * ALTER TABLE, so an already-created table needs a rebuild. One-time,
 * idempotent: a no-op once the column is already nullable (including on a
 * brand-new install, where schema.sql already creates it nullable). */
function relaxWasteLogPriceRequired(db: Database.Database) {
  const cols = db.prepare(`PRAGMA table_info(waste_log_entries)`).all() as Array<{ name: string; notnull: number }>;
  const priceCol = cols.find((c) => c.name === "price_per_unit");
  if (!priceCol || priceCol.notnull === 0) return;
  db.exec(`
    CREATE TABLE waste_log_entries_new (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id),
      item TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      price_per_unit REAL,
      reason TEXT,
      wasted_date TEXT NOT NULL,
      notes TEXT,
      logged_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    INSERT INTO waste_log_entries_new SELECT * FROM waste_log_entries;
    DROP TABLE waste_log_entries;
    ALTER TABLE waste_log_entries_new RENAME TO waste_log_entries;
  `);
}

/** weekly_ops_summaries used to bundle OT and COGS into one row per week --
 * split into weekly_ot_summaries/weekly_cogs_summaries (see schema.sql) so
 * each can carry its own week_start, since OT is entered for the week just
 * scheduled while COGS actual only exists once that week's Saturday
 * inventory count closes it out. One-time, idempotent: INSERT OR IGNORE
 * against each new table's own (store_id, week_start) unique index means a
 * second run just does nothing once the old rows are already carried over. */
function splitWeeklyOpsSummaries(db: Database.Database) {
  const rows = db.prepare(`SELECT * FROM weekly_ops_summaries`).all() as Array<{
    id: string;
    store_id: string;
    week_start: string;
    ot_foh_hours: number | null;
    ot_boh_hours: number | null;
    cogs_actual_pct: number | null;
    cogs_goal_pct: number | null;
    ot_notes: string | null;
    cogs_notes: string | null;
    created_by: string | null;
    created_at: string;
  }>;
  const insertOt = db.prepare(
    `INSERT OR IGNORE INTO weekly_ot_summaries (id, store_id, week_start, ot_foh_hours, ot_boh_hours, ot_notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertCogs = db.prepare(
    `INSERT OR IGNORE INTO weekly_cogs_summaries (id, store_id, week_start, cogs_actual_pct, cogs_goal_pct, cogs_notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    if (r.ot_foh_hours !== null || r.ot_boh_hours !== null || r.ot_notes !== null) {
      insertOt.run(r.id + "-ot", r.store_id, r.week_start, r.ot_foh_hours, r.ot_boh_hours, r.ot_notes, r.created_by, r.created_at);
    }
    if (r.cogs_actual_pct !== null || r.cogs_goal_pct !== null || r.cogs_notes !== null) {
      insertCogs.run(r.id + "-cogs", r.store_id, r.week_start, r.cogs_actual_pct, r.cogs_goal_pct, r.cogs_notes, r.created_by, r.created_at);
    }
  }
}

export function getDb(): Database.Database {
  if (!global.__shiftOpsDb) {
    global.__shiftOpsDb = createConnection();
  }
  return global.__shiftOpsDb;
}
