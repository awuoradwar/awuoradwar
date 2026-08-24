import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";
import { storeToday } from "../storeTime";
import { weekStartOf } from "./recurrenceService";

export type WasteReason = "SPOILED" | "OVERPREP" | "DROPPED" | "QUALITY" | "OTHER";

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
  pricePerUnit: number | null;
  reason?: WasteReason | null;
  wastedDate: string;
  notes?: string | null;
  actor: SessionUser;
  idempotencyKey?: string;
}

export function createWasteEntry(params: CreateWasteParams) {
  return withIdempotency("waste_log_entry", params.idempotencyKey, () => insertWasteEntry(params));
}

function insertWasteEntry(params: CreateWasteParams) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO waste_log_entries (id, store_id, item, quantity, unit, price_per_unit, reason, wasted_date, notes, logged_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.item,
    params.quantity,
    params.unit,
    params.pricePerUnit,
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
    newValue: { item: params.item, quantity: params.quantity, unit: params.unit, price_per_unit: params.pricePerUnit },
  });
  return id;
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

/** Dollar value of everything logged today / this Sun-Sat week / this
 * calendar month -- three separate, genuinely different questions ("how
 * bad was today" vs "are we trending better or worse this month") rather
 * than picking just one rollup. */
export function getWasteTotals(storeId: string): WasteTotals {
  const db = getDb();
  const today = storeToday(storeId);
  const weekStart = weekStartOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;

  const sumFrom = (sinceDate: string) =>
    (
      db
        .prepare(`SELECT COALESCE(SUM(quantity * price_per_unit), 0) as total FROM waste_log_entries WHERE store_id = ? AND wasted_date >= ?`)
        .get(storeId, sinceDate) as { total: number }
    ).total;
  const sumOn = (date: string) =>
    (
      db
        .prepare(`SELECT COALESCE(SUM(quantity * price_per_unit), 0) as total FROM waste_log_entries WHERE store_id = ? AND wasted_date = ?`)
        .get(storeId, date) as { total: number }
    ).total;

  return {
    today: sumOn(today),
    thisWeek: sumFrom(weekStart),
    thisMonth: sumFrom(monthStart),
  };
}
