import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { storeToday } from "../storeTime";
import { SessionUser } from "../types";

export type ProcedureCategory = "FOH" | "BOH" | "PATIO_WINDOWS";
export type ProcedureShiftType = "OPENING" | "CLOSING";

export interface ProcedureArea {
  id: string;
  store_id: string;
  name: string;
  category: ProcedureCategory;
  sort_order: number;
  active: number;
  created_at: string;
}

export interface ProcedureItem {
  id: string;
  area_id: string;
  shift_type: ProcedureShiftType;
  text: string;
  text_es: string | null;
  sort_order: number;
  active: number;
}

export interface ProcedureSubmissionItem {
  text: string;
  textEs: string | null;
  checked: boolean;
}

export interface ProcedureSubmission {
  id: string;
  store_id: string;
  area_id: string;
  shift_type: ProcedureShiftType;
  associate_name: string;
  items_json: string;
  notes: string | null;
  submitted_date: string;
  created_at: string;
  area_name?: string;
  area_category?: ProcedureCategory;
}

// --- Public link/token -------------------------------------------------

/** Looks up the store a public procedures link belongs to. Returns
 * undefined for a missing/regenerated token -- the caller shows "this
 * link is no longer valid" rather than leaking whether the token ever
 * existed. */
export function getStoreByProceduresToken(token: string): { id: string; name: string } | undefined {
  const db = getDb();
  return db.prepare(`SELECT id, name FROM stores WHERE procedures_token = ?`).get(token) as { id: string; name: string } | undefined;
}

export function getProceduresToken(storeId: string): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT procedures_token FROM stores WHERE id = ?`).get(storeId) as { procedures_token: string | null };
  return row.procedures_token;
}

/** Generates (or replaces) this store's public procedures link -- long
 * enough to be unguessable, url-safe. Replacing an old token immediately
 * invalidates every copy of the previous link/QR code still floating
 * around (a printed sheet at the register, a saved bookmark). */
export function regenerateProceduresToken(storeId: string, actor: SessionUser): string {
  const db = getDb();
  const token = randomBytes(24).toString("base64url");
  db.prepare(`UPDATE stores SET procedures_token = ? WHERE id = ?`).run(token, storeId);
  writeAudit({ entityType: "store", entityId: storeId, actor, action: "EDITED", newValue: { procedures_token_regenerated: true } });
  return token;
}

// --- Areas ---------------------------------------------------------------

const AREA_COLUMNS = "id, store_id, name, category, sort_order, active, created_at";

export function listActiveAreas(storeId: string): ProcedureArea[] {
  const db = getDb();
  return db
    .prepare(`SELECT ${AREA_COLUMNS} FROM procedure_areas WHERE store_id = ? AND active = 1 ORDER BY category, sort_order, name`)
    .all(storeId) as ProcedureArea[];
}

export function listAllAreas(storeId: string): ProcedureArea[] {
  const db = getDb();
  return db.prepare(`SELECT ${AREA_COLUMNS} FROM procedure_areas WHERE store_id = ? ORDER BY active DESC, category, sort_order, name`).all(storeId) as ProcedureArea[];
}

export function getArea(areaId: string, storeId: string): ProcedureArea | undefined {
  const db = getDb();
  return db.prepare(`SELECT ${AREA_COLUMNS} FROM procedure_areas WHERE id = ? AND store_id = ?`).get(areaId, storeId) as ProcedureArea | undefined;
}

export function createArea(storeId: string, name: string, category: ProcedureCategory, actor: SessionUser): { id?: string; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const db = getDb();
  const maxOrder = db.prepare(`SELECT MAX(sort_order) as m FROM procedure_areas WHERE store_id = ? AND category = ?`).get(storeId, category) as { m: number | null };
  const id = newId();
  db.prepare(
    `INSERT INTO procedure_areas (id, store_id, name, category, sort_order, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, storeId, trimmed, category, (maxOrder.m ?? -1) + 1, actor.id, nowIso());
  writeAudit({ entityType: "procedure_area", entityId: id, actor, action: "CREATED", newValue: { name: trimmed, category } });
  return { id };
}

/** Deactivate only, never delete -- past submissions keep referencing this
 * area's id for display, and a deactivated area simply stops being
 * offered on the public checklist going forward. */
export function deactivateArea(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE procedure_areas SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "procedure_area", entityId: id, actor, action: "CANCELLED" });
}

// --- Checklist items -------------------------------------------------------

export function listItemsForArea(areaId: string, shiftType: ProcedureShiftType): ProcedureItem[] {
  const db = getDb();
  return db
    .prepare(`SELECT id, area_id, shift_type, text, text_es, sort_order, active FROM procedure_items WHERE area_id = ? AND shift_type = ? AND active = 1 ORDER BY sort_order, text`)
    .all(areaId, shiftType) as ProcedureItem[];
}

export function listAllItemsForArea(areaId: string): ProcedureItem[] {
  const db = getDb();
  return db
    .prepare(`SELECT id, area_id, shift_type, text, text_es, sort_order, active FROM procedure_items WHERE area_id = ? AND active = 1 ORDER BY shift_type, sort_order, text`)
    .all(areaId) as ProcedureItem[];
}

export function addItem(areaId: string, shiftType: ProcedureShiftType, text: string, textEs: string | null, actor: SessionUser): { id?: string; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Step text is required." };
  const db = getDb();
  const maxOrder = db.prepare(`SELECT MAX(sort_order) as m FROM procedure_items WHERE area_id = ? AND shift_type = ?`).get(areaId, shiftType) as { m: number | null };
  const id = newId();
  db.prepare(
    `INSERT INTO procedure_items (id, area_id, shift_type, text, text_es, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(id, areaId, shiftType, trimmed, textEs?.trim() || null, (maxOrder.m ?? -1) + 1, nowIso());
  writeAudit({ entityType: "procedure_item", entityId: id, actor, action: "CREATED", newValue: { text: trimmed, shiftType } });
  return { id };
}

export function removeItem(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE procedure_items SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "procedure_item", entityId: id, actor, action: "CANCELLED" });
}

// --- Submissions -----------------------------------------------------------

/** The public checklist's one write path -- no logged-in actor exists here
 * (see writeAudit's actor: null), so the associate's typed name on the row
 * itself is the only accountability record, by design (per how this
 * feature was scoped: the submission itself is the completion record). */
export function submitProcedure(params: {
  storeId: string;
  areaId: string;
  shiftType: ProcedureShiftType;
  associateName: string;
  items: ProcedureSubmissionItem[];
  notes: string | null;
}): { id?: string; error?: string } {
  const name = params.associateName.trim();
  if (!name) return { error: "Name is required." };
  if (params.items.length === 0) return { error: "Nothing to submit." };
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO procedure_submissions (id, store_id, area_id, shift_type, associate_name, items_json, notes, submitted_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.storeId, params.areaId, params.shiftType, name, JSON.stringify(params.items), params.notes?.trim() || null, storeToday(params.storeId), nowIso());
  writeAudit({ entityType: "procedure_submission", entityId: id, actor: null, action: "CREATED", newValue: { associateName: name, areaId: params.areaId, shiftType: params.shiftType } });
  return { id };
}

export function getRecentSubmissions(storeId: string, limit = 50): ProcedureSubmission[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.*, a.name as area_name, a.category as area_category
       FROM procedure_submissions s JOIN procedure_areas a ON a.id = s.area_id
       WHERE s.store_id = ? ORDER BY s.created_at DESC LIMIT ?`
    )
    .all(storeId, limit) as ProcedureSubmission[];
}

export function getSubmissionsForDate(storeId: string, date: string): ProcedureSubmission[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.*, a.name as area_name, a.category as area_category
       FROM procedure_submissions s JOIN procedure_areas a ON a.id = s.area_id
       WHERE s.store_id = ? AND s.submitted_date = ? ORDER BY s.created_at DESC`
    )
    .all(storeId, date) as ProcedureSubmission[];
}

/** Every submission for one area across a date range, inclusive -- the raw
 * material for the per-station week view (who covered Opening/Closing each
 * day). A day can have more than one submission for the same shift (two
 * associates split a station, or a genuine re-submit); the caller groups
 * these by date+shift_type rather than assuming exactly one. */
export function getSubmissionsForAreaInRange(areaId: string, storeId: string, startDate: string, endDate: string): ProcedureSubmission[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM procedure_submissions WHERE area_id = ? AND store_id = ? AND submitted_date BETWEEN ? AND ? ORDER BY created_at ASC`
    )
    .all(areaId, storeId, startDate, endDate) as ProcedureSubmission[];
}

/** Which of this store's active areas had NO submission for a given
 * shift_type on a given (already-past) date -- the "flagged as missed"
 * signal on the area list itself, so a manager sees a problem without
 * drilling into every station. Only ever called with a date that has
 * already fully happened (yesterday, not today -- today's closing simply
 * hasn't happened yet, which is not the same thing as missed). */
export function getMissedAreasForDate(storeId: string, date: string, shiftType: ProcedureShiftType): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id FROM procedure_areas a
       WHERE a.store_id = ? AND a.active = 1
       AND NOT EXISTS (SELECT 1 FROM procedure_submissions s WHERE s.area_id = a.id AND s.shift_type = ? AND s.submitted_date = ?)`
    )
    .all(storeId, shiftType, date) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}
