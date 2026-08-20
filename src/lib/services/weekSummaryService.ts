import "server-only";
import { getDb } from "../db";
import { storeDayRangeUtc } from "../storeTime";
import { Language } from "../types";

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
    created_at: string;
    releasedThisWeek: boolean;
  } | null;
}

/**
 * A single-screen rollup for a Sunday-Saturday week: how much shift-ops
 * activity actually happened (tasks, cleaning, meal replacements, issues),
 * plus the P&L/GEM period that's current as of that week. Nothing here is a
 * stored snapshot -- every week's underlying records stay in the database
 * indefinitely, so this is computed fresh from history on every view.
 *
 * P&L periods don't line up with calendar weeks -- a period runs several
 * weeks and only gets logged once, the first Friday of the new period. So
 * "this week's period" means the latest one on file as of the end of this
 * week, not one literally created during this week -- otherwise every week
 * except the release week would wrongly show "no period logged" even though
 * that period is still the active one.
 */
export function getWeekSummary(storeId: string, weekStart: string, weekEnd: string): WeekSummary {
  const db = getDb();
  // scheduled_date is a plain store-local date column, compared as-is
  // below; everything else here is a UTC timestamp, so the week boundary
  // has to go through the store's real timezone rather than a bare
  // string concatenation.
  const { start: weekStartTs } = storeDayRangeUtc(storeId, weekStart);
  const { end: dayEnd } = storeDayRangeUtc(storeId, weekEnd);

  const tasksScheduled = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND scheduled_date BETWEEN ? AND ? AND status != 'CANCELLED'`)
    .get(storeId, weekStart, weekEnd) as { n: number };

  const tasksCompleted = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status = 'COMPLETE' AND completed_at >= ? AND completed_at < ?`)
    .get(storeId, weekStartTs, dayEnd) as { n: number };

  const tasksStillOpen = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND scheduled_date BETWEEN ? AND ? AND status IN ('OPEN','IN_PROGRESS')`)
    .get(storeId, weekStart, weekEnd) as { n: number };

  const cleaningCompletions = db
    .prepare(
      `SELECT COUNT(*) as n FROM audit_events ae
       JOIN cleaning_tasks ct ON ct.id = ae.entity_id
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE ae.entity_type = 'cleaning_task' AND ae.action IN ('COMPLETED','VERIFIED') AND a.store_id = ? AND ae.created_at >= ? AND ae.created_at < ?`
    )
    .get(storeId, weekStartTs, dayEnd) as { n: number };

  const mealReplacementsHandled = db
    .prepare(`SELECT COUNT(*) as n FROM guest_recoveries WHERE store_id = ? AND replacement_status = 'COMPLETED' AND completed_at >= ? AND completed_at < ?`)
    .get(storeId, weekStartTs, dayEnd) as { n: number };

  const issuesOpened = db
    .prepare(`SELECT COUNT(*) as n FROM issues WHERE store_id = ? AND created_at >= ? AND created_at < ?`)
    .get(storeId, weekStartTs, dayEnd) as { n: number };

  const issuesResolved = db
    .prepare(`SELECT COUNT(*) as n FROM issues WHERE store_id = ? AND status = 'RESOLVED' AND resolved_at >= ? AND resolved_at < ?`)
    .get(storeId, weekStartTs, dayEnd) as { n: number };

  const periodRow = db
    .prepare(
      `SELECT id, period_label, net_sales_actual, labor_pct, created_at
       FROM store_pnl_periods WHERE store_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(storeId, dayEnd) as (Omit<NonNullable<WeekSummary["period"]>, "releasedThisWeek">) | undefined;
  const period: WeekSummary["period"] = periodRow
    ? { ...periodRow, releasedThisWeek: periodRow.created_at >= weekStartTs }
    : null;

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
    period,
  };
}

export interface WeekItemRow {
  id: string;
  title: string;
  subtitle: string | null;
  at: string;
}

/** The actual items behind each Weekly Summary stat tile, using the exact
 * same filter criteria as getWeekSummary's counts -- so the drill-down list
 * a manager taps into always matches the number they tapped on. */
export function getWeekDetail(storeId: string, weekStart: string, weekEnd: string, lang: Language = "en") {
  const db = getDb();
  const { start: weekStartTs } = storeDayRangeUtc(storeId, weekStart);
  const { end: dayEnd } = storeDayRangeUtc(storeId, weekEnd);

  const tasksCompleted = db
    .prepare(
      `SELECT t.id, t.title, t.completed_at as at, u.name as by_name FROM tasks t
       LEFT JOIN users u ON u.id = t.completed_by
       WHERE t.store_id = ? AND t.status = 'COMPLETE' AND t.completed_at >= ? AND t.completed_at < ? ORDER BY t.completed_at DESC`
    )
    .all(storeId, weekStartTs, dayEnd) as Array<{ id: string; title: string; at: string; by_name: string | null }>;

  const tasksStillOpen = db
    .prepare(
      `SELECT t.id, t.title, t.due_at as at, u.name as by_name FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       WHERE t.store_id = ? AND t.scheduled_date BETWEEN ? AND ? AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_at IS NULL, t.due_at ASC`
    )
    .all(storeId, weekStart, weekEnd) as Array<{ id: string; title: string; at: string | null; by_name: string | null }>;

  const cleaningCompletions = db
    .prepare(
      `SELECT ae.id, ct.title, ct.associate_name, ae.action, ae.new_value, ae.created_at as at, u.name as by_name
       FROM audit_events ae
       JOIN cleaning_tasks ct ON ct.id = ae.entity_id
       JOIN cleaning_areas a ON a.id = ct.area_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'cleaning_task' AND ae.action IN ('COMPLETED','VERIFIED') AND a.store_id = ? AND ae.created_at >= ? AND ae.created_at < ?
       ORDER BY ae.created_at DESC`
    )
    .all(storeId, weekStartTs, dayEnd) as Array<{
    id: string;
    title: string;
    associate_name: string | null;
    action: string;
    new_value: string | null;
    at: string;
    by_name: string | null;
  }>;

  const mealReplacements = db
    .prepare(
      `SELECT gr.id, gr.issue_category, gr.guest_name, gr.item_description, gr.completed_at as at, u.name as by_name
       FROM guest_recoveries gr LEFT JOIN users u ON u.id = gr.completed_by
       WHERE gr.store_id = ? AND gr.replacement_status = 'COMPLETED' AND gr.completed_at >= ? AND gr.completed_at < ? ORDER BY gr.completed_at DESC`
    )
    .all(storeId, weekStartTs, dayEnd) as Array<{
    id: string;
    issue_category: string;
    guest_name: string | null;
    item_description: string | null;
    at: string;
    by_name: string | null;
  }>;

  const issuesResolved = db
    .prepare(
      `SELECT i.id, i.description, i.category, i.resolved_at as at FROM issues i
       WHERE i.store_id = ? AND i.status = 'RESOLVED' AND i.resolved_at >= ? AND i.resolved_at < ? ORDER BY i.resolved_at DESC`
    )
    .all(storeId, weekStartTs, dayEnd) as Array<{ id: string; description: string; category: string; at: string }>;

  return {
    tasksCompleted: tasksCompleted.map((t) => ({ id: t.id, title: t.title, subtitle: t.by_name, at: t.at } satisfies WeekItemRow)),
    tasksStillOpen: tasksStillOpen.map((t) => ({ id: t.id, title: t.title, subtitle: t.by_name, at: t.at || "" } satisfies WeekItemRow)),
    cleaningCompletions: cleaningCompletions.map((c) => {
      // The live associate_name gets wiped by the next daily/weekly reset,
      // so prefer the snapshot captured on the audit event itself; older
      // events written before that snapshot existed fall back to the
      // (possibly since-reset) live column.
      let snapshotAssociate: string | null | undefined;
      try {
        snapshotAssociate = c.new_value ? (JSON.parse(c.new_value) as { associate_name?: string | null }).associate_name : undefined;
      } catch {
        snapshotAssociate = undefined;
      }
      const associate = snapshotAssociate !== undefined ? snapshotAssociate : c.associate_name;
      const byLabel = c.action === "VERIFIED" ? (lang === "es" ? "Verificado por" : "Verified by") : lang === "es" ? "Completado por" : "Completed by";
      const parts = [
        associate ? `${lang === "es" ? "Asociado" : "Associate"}: ${associate}` : null,
        c.by_name ? `${byLabel}: ${c.by_name}` : null,
      ].filter(Boolean);
      return { id: c.id, title: c.title, subtitle: parts.length > 0 ? parts.join(" · ") : null, at: c.at } satisfies WeekItemRow;
    }),
    mealReplacements: mealReplacements.map(
      (m) =>
        ({
          id: m.id,
          title: `${m.guest_name ? `${m.guest_name} · ` : ""}${m.item_description || m.issue_category}`,
          subtitle: m.by_name,
          at: m.at,
        }) satisfies WeekItemRow
    ),
    issuesResolved: issuesResolved.map((i) => ({ id: i.id, title: i.description, subtitle: i.category, at: i.at } satisfies WeekItemRow)),
  };
}
