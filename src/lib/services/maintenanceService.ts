import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export interface MaintenanceItem {
  id: string;
  name: string;
  location: string | null;
  interval_days: number;
  notes: string | null;
  last_done_at: string | null;
  last_done_by_name: string | null;
  next_due_at: string; // computed: last_done_at + interval_days, or "now" if never done
  daysUntilDue: number; // negative = overdue
}

function computeDue(lastDoneAt: string | null, intervalDays: number, now: Date) {
  const base = lastDoneAt ? new Date(lastDoneAt) : now;
  const nextDue = lastDoneAt ? new Date(base.getTime() + intervalDays * 86400000) : now;
  const daysUntilDue = Math.ceil((nextDue.getTime() - now.getTime()) / 86400000);
  return { next_due_at: nextDue.toISOString(), daysUntilDue };
}

/** Recurring replace/service items, soonest-due first -- the append-only
 * audit trail (see getMaintenanceHistory) is what actually answers "when
 * does this need switching again," this list is just the current state. */
export function getMaintenanceItems(storeId: string): MaintenanceItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT mi.id, mi.name, mi.location, mi.interval_days, mi.notes, mi.last_done_at, u.name as last_done_by_name
       FROM maintenance_items mi LEFT JOIN users u ON u.id = mi.last_done_by
       WHERE mi.store_id = ? AND mi.active = 1`
    )
    .all(storeId) as Array<{
    id: string;
    name: string;
    location: string | null;
    interval_days: number;
    notes: string | null;
    last_done_at: string | null;
    last_done_by_name: string | null;
  }>;
  const now = new Date();
  return rows
    .map((r) => ({ ...r, ...computeDue(r.last_done_at, r.interval_days, now) }))
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function createMaintenanceItem(storeId: string, name: string, location: string | null, intervalDays: number, notes: string | null, actor: SessionUser): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO maintenance_items (id, store_id, name, location, interval_days, notes, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, storeId, name, location || null, intervalDays, notes || null, actor.id, nowIso());
  writeAudit({ entityType: "maintenance_item", entityId: id, actor, action: "CREATED", newValue: { name, intervalDays } });
  return id;
}

export function removeMaintenanceItem(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE maintenance_items SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "maintenance_item", entityId: id, actor, action: "CANCELLED" });
}

/** Resets the due date and leaves a dated, attributed entry in the audit
 * trail -- the actual record of "when did this last get switched." */
export function markMaintenanceDone(id: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE maintenance_items SET last_done_at = ?, last_done_by = ? WHERE id = ?`).run(ts, actor.id, id);
  writeAudit({ entityType: "maintenance_item", entityId: id, actor, action: "COMPLETED" });
}

export interface MaintenanceHistoryRow {
  id: string;
  action: string;
  actor_name: string | null;
  created_at: string;
}

export function getMaintenanceHistory(itemId: string): MaintenanceHistoryRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ae.id, ae.action, u.name as actor_name, ae.created_at FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'maintenance_item' AND ae.entity_id = ? AND ae.action = 'COMPLETED'
       ORDER BY ae.created_at DESC`
    )
    .all(itemId) as MaintenanceHistoryRow[];
}
