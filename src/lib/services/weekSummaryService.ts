import "server-only";
import { getDb } from "../db";

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  tasksScheduled: number;
  tasksCompleted: number;
  tasksStillOpen: number;
  cleaningCompletions: number;
  mealReplacementsHandled: number;
  issuesOpened: number;
  issuesResolved: number;
  period: {
    id: string;
    period_label: string;
    net_sales_actual: number | null;
    labor_pct: number | null;
    gem_taste_score: number | null;
    gem_taste_goal: number | null;
    gem_accuracy_score: number | null;
    gem_accuracy_goal: number | null;
  } | null;
}

/**
 * A single-screen rollup for a Sunday-Saturday week: how much shift-ops
 * activity actually happened (tasks, cleaning, meal replacements, issues),
 * plus that week's P&L/GEM entry if a GM logged one during it. Nothing here
 * is a stored snapshot -- every week's underlying records stay in the
 * database indefinitely, so this is computed fresh from history on every
 * view. That also means it works for any week, not just the one just ended.
 */
export function getWeekSummary(storeId: string, weekStart: string, weekEnd: string): WeekSummary {
  const db = getDb();
  const dayEnd = `${weekEnd}T23:59:59`;

  const tasksScheduled = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND scheduled_date BETWEEN ? AND ? AND status != 'CANCELLED'`)
    .get(storeId, weekStart, weekEnd) as { n: number };

  const tasksCompleted = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status = 'COMPLETE' AND completed_at BETWEEN ? AND ?`)
    .get(storeId, `${weekStart}T00:00:00`, dayEnd) as { n: number };

  const tasksStillOpen = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND scheduled_date BETWEEN ? AND ? AND status IN ('OPEN','IN_PROGRESS')`)
    .get(storeId, weekStart, weekEnd) as { n: number };

  const cleaningCompletions = db
    .prepare(
      `SELECT COUNT(*) as n FROM audit_events ae
       JOIN cleaning_tasks ct ON ct.id = ae.entity_id
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE ae.entity_type = 'cleaning_task' AND ae.action IN ('COMPLETED','VERIFIED') AND a.store_id = ? AND ae.created_at BETWEEN ? AND ?`
    )
    .get(storeId, `${weekStart}T00:00:00`, dayEnd) as { n: number };

  const mealReplacementsHandled = db
    .prepare(`SELECT COUNT(*) as n FROM guest_recoveries WHERE store_id = ? AND replacement_status = 'COMPLETED' AND completed_at BETWEEN ? AND ?`)
    .get(storeId, `${weekStart}T00:00:00`, dayEnd) as { n: number };

  const issuesOpened = db
    .prepare(`SELECT COUNT(*) as n FROM issues WHERE store_id = ? AND created_at BETWEEN ? AND ?`)
    .get(storeId, `${weekStart}T00:00:00`, dayEnd) as { n: number };

  const issuesResolved = db
    .prepare(`SELECT COUNT(*) as n FROM issues WHERE store_id = ? AND status = 'RESOLVED' AND resolved_at BETWEEN ? AND ?`)
    .get(storeId, `${weekStart}T00:00:00`, dayEnd) as { n: number };

  const period = db
    .prepare(
      `SELECT id, period_label, net_sales_actual, labor_pct, gem_taste_score, gem_taste_goal, gem_accuracy_score, gem_accuracy_goal
       FROM store_pnl_periods WHERE store_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(storeId, `${weekStart}T00:00:00`, dayEnd) as WeekSummary["period"] | undefined;

  return {
    weekStart,
    weekEnd,
    tasksScheduled: tasksScheduled.n,
    tasksCompleted: tasksCompleted.n,
    tasksStillOpen: tasksStillOpen.n,
    cleaningCompletions: cleaningCompletions.n,
    mealReplacementsHandled: mealReplacementsHandled.n,
    issuesOpened: issuesOpened.n,
    issuesResolved: issuesResolved.n,
    period: period || null,
  };
}
