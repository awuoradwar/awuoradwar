import "server-only";
import { getDb } from "../db";
import { storeDayRangeUtc } from "../storeTime";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The specific named metrics from the spec's Product Success Metrics table:
 * median quick-add completion time, incoming handoff acknowledgement time,
 * overdue critical expectations, carry-forward aging, unassigned weekly
 * work, weekly active managers/PICs, duplicate/reopened errors. Computed
 * directly from existing timestamps -- no new tracking tables needed.
 */
export function getQualityMetrics(storeId: string, start: string, end: string) {
  const db = getDb();
  // start/end here are store-local calendar dates ("YYYY-MM-DD"); the
  // columns below are UTC timestamps, so the range has to go through a
  // real timezone conversion rather than naive string concatenation --
  // otherwise anything within a few hours of local midnight at either edge
  // gets miscounted in or out of the range.
  const rangeStart = storeDayRangeUtc(storeId, start).start;
  const dayEnd = storeDayRangeUtc(storeId, end).end;

  // Median quick-add (QUICK-effort) completion time, minutes from creation to completion.
  const quickCompletions = db
    .prepare(
      `SELECT created_at, completed_at FROM tasks
       WHERE store_id = ? AND effort = 'QUICK' AND status = 'COMPLETE' AND completed_at IS NOT NULL
       AND created_at >= ? AND created_at < ?`
    )
    .all(storeId, rangeStart, dayEnd) as Array<{ created_at: string; completed_at: string }>;
  const quickAddMinutes = quickCompletions.map((t) => (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 60000);
  const medianQuickAddMinutes = median(quickAddMinutes);

  // Incoming handoff acknowledgement time, minutes from generation to acknowledgement.
  const handoffs = db
    .prepare(
      `SELECT created_at, incoming_acknowledged_at FROM handoffs
       WHERE store_id = ? AND incoming_acknowledged_at IS NOT NULL AND created_at >= ? AND created_at < ?`
    )
    .all(storeId, rangeStart, dayEnd) as Array<{ created_at: string; incoming_acknowledged_at: string }>;
  const ackMinutes = handoffs.map((h) => (new Date(h.incoming_acknowledged_at).getTime() - new Date(h.created_at).getTime()) / 60000);
  const medianHandoffAckMinutes = median(ackMinutes);

  // Overdue CRITICAL expectations (right now, not date-ranged -- this is a current-state check).
  const overdueCritical = db
    .prepare(
      `SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status IN ('OPEN','IN_PROGRESS')
       AND severity = 'CRITICAL' AND due_at IS NOT NULL AND due_at < ?`
    )
    .get(storeId, new Date().toISOString()) as { n: number };

  // Carry-forward aging: average days since a still-open task was last carried forward.
  const carriedForward = db
    .prepare(
      `SELECT ae.created_at FROM audit_events ae
       JOIN tasks t ON t.id = ae.entity_id
       WHERE ae.entity_type = 'task' AND ae.action = 'CARRIED_FORWARD' AND t.store_id = ?
       AND t.status IN ('OPEN','IN_PROGRESS') AND ae.created_at >= ? AND ae.created_at < ?`
    )
    .all(storeId, rangeStart, dayEnd) as Array<{ created_at: string }>;
  const now = Date.now();
  const carryForwardAgeDays = carriedForward.length
    ? carriedForward.reduce((sum, c) => sum + (now - new Date(c.created_at).getTime()) / 86400000, 0) / carriedForward.length
    : null;

  // Unassigned work scheduled within this range (planning gap). scheduled_date
  // is already a plain store-local "YYYY-MM-DD" column, not a timestamp, so
  // a direct string comparison against start/end is correct as-is.
  const unassignedThisWeek = db
    .prepare(
      `SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND owner_id IS NULL AND status IN ('OPEN','IN_PROGRESS')
       AND scheduled_date BETWEEN ? AND ?`
    )
    .get(storeId, start, end) as { n: number };

  // Weekly active managers/PICs: distinct PIC across shifts in range (shifts.date is also a plain date column).
  const activePics = db
    .prepare(`SELECT COUNT(DISTINCT pic_user_id) as n FROM shifts WHERE store_id = ? AND date BETWEEN ? AND ? AND pic_user_id IS NOT NULL`)
    .get(storeId, start, end) as { n: number };

  // Duplicate/reopened errors: entities reopened in range (data-quality signal, not engagement).
  const reopenedEvents = db
    .prepare(
      `SELECT COUNT(*) as n FROM audit_events WHERE action = 'REOPENED' AND created_at >= ? AND created_at < ?
       AND entity_id IN (
         SELECT id FROM tasks WHERE store_id = ?
         UNION SELECT id FROM issues WHERE store_id = ?
         UNION SELECT ct.id FROM cleaning_tasks ct JOIN cleaning_areas a ON a.id = ct.area_id WHERE a.store_id = ?
       )`
    )
    .get(rangeStart, dayEnd, storeId, storeId, storeId) as { n: number };

  return {
    medianQuickAddMinutes,
    medianHandoffAckMinutes,
    overdueCritical: overdueCritical.n,
    carryForwardAgeDays,
    unassignedThisWeek: unassignedThisWeek.n,
    activePics: activePics.n,
    reopenedCount: reopenedEvents.n,
  };
}

/** Lightweight count for the My Shift dashboard header -- avoids the extra
 * queries getCompletionStats does for the fuller Reports breakdown. */
export function getCompletedThisShiftCount(storeId: string, viewerId: string, todayStr: string): number {
  const db = getDb();
  const { start, end } = storeDayRangeUtc(storeId, todayStr);
  const row = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND completed_by = ? AND status = 'COMPLETE' AND completed_at >= ? AND completed_at < ?`)
    .get(storeId, viewerId, start, end) as { n: number };
  return row.n;
}

/** Completed-task counts for the "efficiency" view: this viewer's own shift,
 * today store-wide, and this week store-wide. */
export function getCompletionStats(storeId: string, viewerId: string, todayStr: string, weekStartStr: string, weekEndStr: string) {
  const db = getDb();
  const { start: dayStart, end: dayEnd } = storeDayRangeUtc(storeId, todayStr);
  const { start: weekStart } = storeDayRangeUtc(storeId, weekStartStr);
  const { end: weekEnd } = storeDayRangeUtc(storeId, weekEndStr);

  const mine = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND completed_by = ? AND status = 'COMPLETE' AND completed_at >= ? AND completed_at < ?`)
    .get(storeId, viewerId, dayStart, dayEnd) as { n: number };

  const today = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status = 'COMPLETE' AND completed_at >= ? AND completed_at < ?`)
    .get(storeId, dayStart, dayEnd) as { n: number };

  const week = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status = 'COMPLETE' AND completed_at >= ? AND completed_at < ?`)
    .get(storeId, weekStart, weekEnd) as { n: number };

  return { mine: mine.n, today: today.n, week: week.n };
}
