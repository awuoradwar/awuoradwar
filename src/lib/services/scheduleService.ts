import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser, Position } from "../types";
import { windowForHour } from "./taskService";
import { storeLocalHour } from "../storeTime";

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
    backfillTaskOwnersForDate(storeId, date);
    return existing.id;
  }
  const id = newId();
  db.prepare(
    `INSERT INTO manager_shifts (id, store_id, user_id, date, shift_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, storeId, userId, date, shiftType, actor.id, nowIso());
  writeAudit({ entityType: "manager_shift", entityId: id, actor, action: "CREATED", newValue: { date, shiftType } });
  backfillTaskOwnersForDate(storeId, date);
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

/** The single manager scheduled to cover this shift window on this date, if
 * exactly one matches (a DOUBLE covers both windows) -- used to auto-assign
 * recurring task instances to whoever's actually working. Returns null when
 * nobody's scheduled or more than one manager could cover it, leaving the
 * task unassigned rather than guessing. */
interface ScheduledManager {
  id: string;
  name: string;
  position: Position;
}

/** Everyone scheduled to cover the store-local shift window today, GM
 * included -- the shared source both the single-owner resolver and the
 * display resolver below build on. */
function scheduledManagersForWindow(storeId: string, date: string, window: "MORNING" | "EVENING"): ScheduledManager[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT u.id, u.name, u.position FROM manager_shifts ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.store_id = ? AND ms.date = ? AND (ms.shift_type = ? OR ms.shift_type = 'DOUBLE')`
    )
    .all(storeId, date, window) as ScheduledManager[];
}

/** Whoever "owns" tasks auto-assigned to this window: the GM outranks
 * anyone else scheduled alongside them (GM + AM + Chef together is still
 * just the GM's shift), otherwise the sole scheduled manager, otherwise
 * null when it's genuinely ambiguous -- two or more non-GM managers
 * covering together (e.g. Assistant Manager + Chef, no GM on). */
export function resolveShiftOwnerForWindow(storeId: string, date: string, window: "MORNING" | "EVENING"): string | null {
  const candidates = scheduledManagersForWindow(storeId, date, window);
  if (candidates.length === 0) return null;
  const gm = candidates.find((c) => c.position === "GM");
  if (gm) return gm.id;
  return candidates.length === 1 ? candidates[0].id : null;
}

/** Who to show as "PIC" -- same GM-outranks-everyone rule as above, but
 * covers the case a single owner can't: two or more non-GM managers
 * covering together have no single task-owner, yet there's still a clear
 * "who's in charge" answer worth showing -- both of their names. */
export function resolveTodaysPicDisplay(storeId: string, dateStr: string, nowDate: Date): { names: string[]; position: Position | null } | null {
  const window = windowForHour(storeLocalHour(storeId, nowDate));
  const candidates = scheduledManagersForWindow(storeId, dateStr, window);
  if (candidates.length === 0) return null;
  const gm = candidates.find((c) => c.position === "GM");
  if (gm) return { names: [gm.name], position: "GM" };
  if (candidates.length === 1) return { names: [candidates[0].name], position: candidates[0].position };
  return { names: candidates.map((c) => c.name), position: null };
}

/** Recurring instances already created for `date` before this manager_shift
 * was set (or before the roster was filled in at all) would otherwise stay
 * unassigned forever -- called after setManagerShift to retroactively assign
 * any still-open, still-unowned instance whose due time now resolves to
 * exactly one covering manager. Never reassigns an already-owned task and
 * never un-assigns anything, so it's safe to call on every roster edit. */
/** Who's actually in charge right now, straight from the Week schedule grid --
 * whoever is scheduled MORNING/EVENING/DOUBLE for the store-local current
 * shift window today. This is what "PIC" should mean day to day: marking the
 * schedule IS staffing the shift, with no separate manual "start my shift"
 * step required. Returns null when nobody's scheduled for this window, or
 * more than one manager could cover it (ambiguous). */
export function resolveTodaysPic(storeId: string, dateStr: string, nowDate: Date): { id: string; name: string } | null {
  const db = getDb();
  const window = windowForHour(storeLocalHour(storeId, nowDate));
  const userId = resolveShiftOwnerForWindow(storeId, dateStr, window);
  if (!userId) return null;
  const row = db.prepare(`SELECT name FROM users WHERE id = ?`).get(userId) as { name: string } | undefined;
  return row ? { id: userId, name: row.name } : null;
}

export function backfillTaskOwnersForDate(storeId: string, date: string) {
  const db = getDb();
  const tasks = db
    .prepare(`SELECT id, due_at FROM tasks WHERE store_id = ? AND scheduled_date = ? AND owner_id IS NULL AND status IN ('OPEN','IN_PROGRESS') AND due_at IS NOT NULL`)
    .all(storeId, date) as Array<{ id: string; due_at: string }>;
  if (tasks.length === 0) return;
  for (const task of tasks) {
    const window = windowForHour(storeLocalHour(storeId, new Date(task.due_at)));
    const ownerId = resolveShiftOwnerForWindow(storeId, date, window);
    if (ownerId) {
      db.prepare(`UPDATE tasks SET owner_id = ? WHERE id = ?`).run(ownerId, task.id);
    }
  }
}
