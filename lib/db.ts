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

function createConnection(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

export function getDb(): Database.Database {
  if (!global.__shiftOpsDb) {
    global.__shiftOpsDb = createConnection();
  }
  return global.__shiftOpsDb;
}
