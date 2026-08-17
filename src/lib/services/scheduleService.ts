import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export type ShiftType = "MORNING" | "EVENING" | "DOUBLE";

export interface ManagerShiftRow {
  id: string;
  user_id: string;
  user_name: string;
  date: string;
  shift_type: ShiftType;
}

/** The full week's staffing plan, one row per manager per day they're scheduled. */
export function getWeekManagerSchedule(storeId: string, weekStart: string, weekEnd: string): ManagerShiftRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ms.id, ms.user_id, u.name as user_name, ms.date, ms.shift_type FROM manager_shifts ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.store_id = ? AND ms.date BETWEEN ? AND ?
       ORDER BY ms.date, u.name`
    )
    .all(storeId, weekStart, weekEnd) as ManagerShiftRow[];
}

/** Upsert: setting a shift for a manager/day who already has one replaces it. */
export function setManagerShift(storeId: string, userId: string, date: string, shiftType: ShiftType, actor: SessionUser): string {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM manager_shifts WHERE store_id = ? AND user_id = ? AND date = ?`).get(storeId, userId, date) as
    | { id: string }
    | undefined;
  if (existing) {
    db.prepare(`UPDATE manager_shifts SET shift_type = ?, created_by = ? WHERE id = ?`).run(shiftType, actor.id, existing.id);
    writeAudit({ entityType: "manager_shift", entityId: existing.id, actor, action: "EDITED", newValue: { date, shiftType } });
    return existing.id;
  }
  const id = newId();
  db.prepare(
    `INSERT INTO manager_shifts (id, store_id, user_id, date, shift_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, storeId, userId, date, shiftType, actor.id, nowIso());
  writeAudit({ entityType: "manager_shift", entityId: id, actor, action: "CREATED", newValue: { date, shiftType } });
  return id;
}

export function removeManagerShift(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`DELETE FROM manager_shifts WHERE id = ?`).run(id);
  writeAudit({ entityType: "manager_shift", entityId: id, actor, action: "CANCELLED" });
}

/** What shift (if any) this specific user is scheduled to work today at this
 * store -- the dashboard uses this to know whether they're on MORNING,
 * EVENING, or a DOUBLE, instead of guessing purely from wall-clock time. */
export function getShiftTypeForUserToday(storeId: string, userId: string, dateStr: string): ShiftType | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT shift_type FROM manager_shifts WHERE store_id = ? AND user_id = ? AND date = ?`)
    .get(storeId, userId, dateStr) as { shift_type: ShiftType } | undefined;
  return row?.shift_type ?? null;
}
