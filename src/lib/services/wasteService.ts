import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";
import { storeToday } from "../storeTime";
import { weekStartOf } from "./recurrenceService";

export type WasteReason = "SPOILED" | "OVERPREP" | "UNDERPREP" | "DROPPED" | "QUALITY" | "OTHER";

export interface WasteLogEntry {
  id: string;
  store_id: string;
  item: string;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
  reason: WasteReason | null;
  wasted_date: string;
  notes: string | null;
  logged_by: string | null;
  logged_by_name: string | null;
  created_at: string;
}

const SELECT = `SELECT w.*, u.name as logged_by_name FROM waste_log_entries w LEFT JOIN users u ON u.id = w.logged_by`;

interface CreateWasteParams {
  storeId: string;
  item: string;
  quantity: number;
  unit: string;
  reason?: WasteReason | null;
  wastedDate: string;
  notes?: string | null;
  actor: SessionUser;
  idempotencyKey?: string;
}

export function createWasteEntry(params: CreateWasteParams) {
  return withIdempotency("waste_log_entry", params.idempotencyKey, () => insertWasteEntry(params));
}

// price_per_unit stays in the table (nullable) but nothing writes it right
// now -- it's rarely known exactly when something's tossed, and a partial
// container makes a per-unit price meaningless anyway. Quantity + unit is
// what's actually reliable to log in the moment.
function insertWasteEntry(params: CreateWasteParams) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO waste_log_entries (id, store_id, item, quantity, unit, reason, wasted_date, notes, logged_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.item,
    params.quantity,
    params.unit,
    params.reason || null,
    params.wastedDate,
    params.notes || null,
    params.actor.id,
    nowIso()
  );
  writeAudit({
    entityType: "waste_log_entry",
    entityId: id,
    actor: params.actor,
    action: "CREATED",
    newValue: { item: params.item, quantity: params.quantity, unit: params.unit },
  });
  return id;
}

interface UpdateWasteParams {
  item: string;
  quantity: number;
  unit: string;
  reason?: WasteReason | null;
  wastedDate: string;
  notes?: string | null;
}

export function updateWasteEntry(id: string, storeId: string, params: UpdateWasteParams, actor: SessionUser) {
  const db = getDb();
  db.prepare(
    `UPDATE waste_log_entries SET item = ?, quantity = ?, unit = ?, reason = ?, wasted_date = ?, notes = ? WHERE id = ? AND store_id = ?`
  ).run(params.item, params.quantity, params.unit, params.reason || null, params.wastedDate, params.notes || null, id, storeId);
  writeAudit({
    entityType: "waste_log_entry",
    entityId: id,
    actor,
    action: "EDITED",
    newValue: { item: params.item, quantity: params.quantity, unit: params.unit, wasted_date: params.wastedDate },
  });
}

export function deleteWasteEntry(id: string, storeId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`DELETE FROM waste_log_entries WHERE id = ? AND store_id = ?`).run(id, storeId);
  writeAudit({ entityType: "waste_log_entry", entityId: id, actor, action: "CANCELLED" });
}

export function getWasteEntries(storeId: string, limit = 300): WasteLogEntry[] {
  const db = getDb();
  return db
    .prepare(`${SELECT} WHERE w.store_id = ? ORDER BY w.wasted_date DESC, w.created_at DESC LIMIT ?`)
    .all(storeId, limit) as WasteLogEntry[];
}

export interface WasteTotals {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

/** Entries logged today / this Sun-Sat week / this calendar month -- a
 * dollar rollup isn't possible without a price on every entry, but "how
 * many things did we throw away" is still a real, always-available signal
 * of how bad a stretch is trending. */
export function getWasteTotals(storeId: string): WasteTotals {
  const db = getDb();
  const today = storeToday(storeId);
  const weekStart = weekStartOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;

  const countFrom = (sinceDate: string) =>
    (
      db
        .prepare(`SELECT COUNT(*) as total FROM waste_log_entries WHERE store_id = ? AND wasted_date >= ?`)
        .get(storeId, sinceDate) as { total: number }
    ).total;
  const countOn = (date: string) =>
    (
      db
        .prepare(`SELECT COUNT(*) as total FROM waste_log_entries WHERE store_id = ? AND wasted_date = ?`)
        .get(storeId, date) as { total: number }
    ).total;

  return {
    today: countOn(today),
    thisWeek: countFrom(weekStart),
    thisMonth: countFrom(monthStart),
  };
}
