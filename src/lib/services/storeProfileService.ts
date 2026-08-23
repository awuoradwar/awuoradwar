import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { weekStartOf } from "./recurrenceService";
import { SessionUser } from "../types";

export interface StorePnlPeriod {
  id: string;
  store_id: string;
  period_label: string;
  net_sales_actual: number | null;
  net_sales_prior_year: number | null;
  sss_pct: number | null;
  sst_pct: number | null;
  check_average: number | null;
  cogs_pct: number | null;
  cogs_theoretical_pct: number | null;
  labor_pct: number | null;
  controllable_profit_actual: number | null;
  controllable_profit_pct: number | null;
  restaurant_contribution: number | null;
  restaurant_contribution_pct: number | null;
  pnl_file_ref: string | null;
  released_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function getLatestPeriod(storeId: string): StorePnlPeriod | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT p.*, u.name as created_by_name FROM store_pnl_periods p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.store_id = ? ORDER BY p.created_at DESC LIMIT 1`
    )
    .get(storeId) as StorePnlPeriod | undefined;
}

export function getPeriodHistory(storeId: string, limit = 12): StorePnlPeriod[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT p.*, u.name as created_by_name FROM store_pnl_periods p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.store_id = ? ORDER BY p.created_at DESC LIMIT ?`
    )
    .all(storeId, limit) as StorePnlPeriod[];
}

/** Scoped to storeId so one store can never fetch another's P&L file. */
export function getPnlFileRef(periodId: string, storeId: string) {
  const db = getDb();
  return db
    .prepare(`SELECT pnl_file_ref FROM store_pnl_periods WHERE id = ? AND store_id = ? AND pnl_file_ref IS NOT NULL`)
    .get(periodId, storeId) as { pnl_file_ref: string } | undefined;
}

export function createPeriod(params: {
  storeId: string;
  periodLabel: string;
  netSalesActual: number | null;
  netSalesPriorYear: number | null;
  sssPct: number | null;
  sstPct: number | null;
  checkAverage: number | null;
  cogsPct: number | null;
  cogsTheoreticalPct: number | null;
  laborPct: number | null;
  controllableProfitActual: number | null;
  controllableProfitPct: number | null;
  restaurantContribution: number | null;
  restaurantContributionPct: number | null;
  pnlFileRef: string | null;
  releasedAt: string | null;
  notes: string | null;
  actor: SessionUser;
}): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO store_pnl_periods (
      id, store_id, period_label, net_sales_actual, net_sales_prior_year,
      sss_pct, sst_pct, check_average, cogs_pct, cogs_theoretical_pct, labor_pct,
      controllable_profit_actual, controllable_profit_pct, restaurant_contribution, restaurant_contribution_pct,
      pnl_file_ref, released_at, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.periodLabel,
    params.netSalesActual,
    params.netSalesPriorYear,
    params.sssPct,
    params.sstPct,
    params.checkAverage,
    params.cogsPct,
    params.cogsTheoreticalPct,
    params.laborPct,
    params.controllableProfitActual,
    params.controllableProfitPct,
    params.restaurantContribution,
    params.restaurantContributionPct,
    params.pnlFileRef,
    params.releasedAt,
    params.notes,
    params.actor.id,
    nowIso()
  );
  writeAudit({
    entityType: "store_pnl_period",
    entityId: id,
    actor: params.actor,
    action: "CREATED",
    newValue: { period_label: params.periodLabel, net_sales_actual: params.netSalesActual },
  });
  return id;
}

/** Fix or fill in a period's numbers after the fact -- a period is often
 * created as a placeholder (label only, numbers added once the P&L
 * document actually comes in) rather than fully filled out at creation. */
export function updatePeriod(params: {
  id: string;
  periodLabel: string;
  netSalesActual: number | null;
  netSalesPriorYear: number | null;
  sssPct: number | null;
  sstPct: number | null;
  checkAverage: number | null;
  cogsPct: number | null;
  cogsTheoreticalPct: number | null;
  laborPct: number | null;
  controllableProfitActual: number | null;
  controllableProfitPct: number | null;
  restaurantContribution: number | null;
  restaurantContributionPct: number | null;
  pnlFileRef?: string | null;
  releasedAt: string | null;
  notes: string | null;
  actor: SessionUser;
}) {
  const db = getDb();
  const setPnlFile = params.pnlFileRef !== undefined;
  db.prepare(
    `UPDATE store_pnl_periods SET
      period_label = ?, net_sales_actual = ?, net_sales_prior_year = ?,
      sss_pct = ?, sst_pct = ?, check_average = ?, cogs_pct = ?, cogs_theoretical_pct = ?, labor_pct = ?,
      controllable_profit_actual = ?, controllable_profit_pct = ?, restaurant_contribution = ?, restaurant_contribution_pct = ?,
      released_at = ?, notes = ?${setPnlFile ? ", pnl_file_ref = ?" : ""}
     WHERE id = ?`
  ).run(
    ...[
      params.periodLabel,
      params.netSalesActual,
      params.netSalesPriorYear,
      params.sssPct,
      params.sstPct,
      params.checkAverage,
      params.cogsPct,
      params.cogsTheoreticalPct,
      params.laborPct,
      params.controllableProfitActual,
      params.controllableProfitPct,
      params.restaurantContribution,
      params.restaurantContributionPct,
      params.releasedAt,
      params.notes,
      ...(setPnlFile ? [params.pnlFileRef] : []),
      params.id,
    ]
  );
  writeAudit({
    entityType: "store_pnl_period",
    entityId: params.id,
    actor: params.actor,
    action: "EDITED",
    newValue: { period_label: params.periodLabel, net_sales_actual: params.netSalesActual },
  });
}

export interface StoreGemScore {
  gem_taste_score: number | null;
  gem_taste_goal: number | null;
  gem_accuracy_score: number | null;
  gem_accuracy_goal: number | null;
  gem_updated_by_name: string | null;
  gem_updated_at: string | null;
}

/** GEM lives on the store itself, not on any one P&L period -- it's a
 * live figure that can move day to day, unlike the period numbers (a
 * lagging report released once per period). Just the current standing;
 * no history is kept. */
export function getGemScore(storeId: string): StoreGemScore | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.gem_taste_score, s.gem_taste_goal, s.gem_accuracy_score, s.gem_accuracy_goal, s.gem_updated_at, u.name as gem_updated_by_name
       FROM stores s LEFT JOIN users u ON u.id = s.gem_updated_by
       WHERE s.id = ?`
    )
    .get(storeId) as StoreGemScore | undefined;
}

export function updateGemScore(
  storeId: string,
  params: { gemTasteScore: number | null; gemTasteGoal: number | null; gemAccuracyScore: number | null; gemAccuracyGoal: number | null },
  actor: SessionUser
) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE stores SET gem_taste_score = ?, gem_taste_goal = ?, gem_accuracy_score = ?, gem_accuracy_goal = ?, gem_updated_by = ?, gem_updated_at = ? WHERE id = ?`
  ).run(params.gemTasteScore, params.gemTasteGoal, params.gemAccuracyScore, params.gemAccuracyGoal, actor.id, ts, storeId);
  writeAudit({
    entityType: "store",
    entityId: storeId,
    actor,
    action: "EDITED",
    newValue: {
      gem_taste_score: params.gemTasteScore,
      gem_taste_goal: params.gemTasteGoal,
      gem_accuracy_score: params.gemAccuracyScore,
      gem_accuracy_goal: params.gemAccuracyGoal,
    },
  });
}

export interface WeeklyOtSummary {
  id: string;
  store_id: string;
  week_start: string;
  ot_foh_hours: number | null;
  ot_boh_hours: number | null;
  ot_notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** Every week a GM has logged OT for, most recent first -- typically
 * entered as soon as that week's schedule is built, so this list runs from
 * genuinely past weeks through the current one and, often, straight into
 * weeks that haven't started yet. */
export function getWeeklyOtSummaryHistory(storeId: string, limit = 24): WeeklyOtSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT w.*, u.name as created_by_name FROM weekly_ot_summaries w
       LEFT JOIN users u ON u.id = w.created_by
       WHERE w.store_id = ? ORDER BY w.week_start DESC LIMIT ?`
    )
    .all(storeId, limit) as WeeklyOtSummary[];
}

/** One row per calendar week (Sun-Sat) -- entering a week that already has
 * a row corrects it in place rather than creating a duplicate. */
export function upsertWeeklyOtSummary(
  storeId: string,
  weekStartInput: string,
  fields: { otFohHours: number | null; otBohHours: number | null; otNotes: string | null },
  actor: SessionUser
): string {
  const db = getDb();
  const weekStart = weekStartOf(weekStartInput);
  const existing = db.prepare(`SELECT id FROM weekly_ot_summaries WHERE store_id = ? AND week_start = ?`).get(storeId, weekStart) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(`UPDATE weekly_ot_summaries SET ot_foh_hours = ?, ot_boh_hours = ?, ot_notes = ? WHERE id = ?`).run(
      fields.otFohHours,
      fields.otBohHours,
      fields.otNotes,
      existing.id
    );
    writeAudit({ entityType: "weekly_ot_summary", entityId: existing.id, actor, action: "EDITED", newValue: { week_start: weekStart, ...fields } });
    return existing.id;
  }

  const id = newId();
  db.prepare(
    `INSERT INTO weekly_ot_summaries (id, store_id, week_start, ot_foh_hours, ot_boh_hours, ot_notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, storeId, weekStart, fields.otFohHours, fields.otBohHours, fields.otNotes, actor.id, nowIso());
  writeAudit({ entityType: "weekly_ot_summary", entityId: id, actor, action: "CREATED", newValue: { week_start: weekStart, ...fields } });
  return id;
}

export interface WeeklyCogsSummary {
  id: string;
  store_id: string;
  week_start: string;
  cogs_actual_pct: number | null;
  cogs_goal_pct: number | null;
  cogs_notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** Every week a GM has logged COGS actual/goal for, most recent first --
 * the actual number only exists once that week's Saturday inventory count
 * is in, so entries here are always for a week that's already ended. */
export function getWeeklyCogsSummaryHistory(storeId: string, limit = 24): WeeklyCogsSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT w.*, u.name as created_by_name FROM weekly_cogs_summaries w
       LEFT JOIN users u ON u.id = w.created_by
       WHERE w.store_id = ? ORDER BY w.week_start DESC LIMIT ?`
    )
    .all(storeId, limit) as WeeklyCogsSummary[];
}

/** One row per calendar week (Sun-Sat) -- entering a week that already has
 * a row corrects it in place rather than creating a duplicate. */
export function upsertWeeklyCogsSummary(
  storeId: string,
  weekStartInput: string,
  fields: { cogsActualPct: number | null; cogsGoalPct: number | null; cogsNotes: string | null },
  actor: SessionUser
): string {
  const db = getDb();
  const weekStart = weekStartOf(weekStartInput);
  const existing = db.prepare(`SELECT id FROM weekly_cogs_summaries WHERE store_id = ? AND week_start = ?`).get(storeId, weekStart) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(`UPDATE weekly_cogs_summaries SET cogs_actual_pct = ?, cogs_goal_pct = ?, cogs_notes = ? WHERE id = ?`).run(
      fields.cogsActualPct,
      fields.cogsGoalPct,
      fields.cogsNotes,
      existing.id
    );
    writeAudit({ entityType: "weekly_cogs_summary", entityId: existing.id, actor, action: "EDITED", newValue: { week_start: weekStart, ...fields } });
    return existing.id;
  }

  const id = newId();
  db.prepare(
    `INSERT INTO weekly_cogs_summaries (id, store_id, week_start, cogs_actual_pct, cogs_goal_pct, cogs_notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, storeId, weekStart, fields.cogsActualPct, fields.cogsGoalPct, fields.cogsNotes, actor.id, nowIso());
  writeAudit({ entityType: "weekly_cogs_summary", entityId: id, actor, action: "CREATED", newValue: { week_start: weekStart, ...fields } });
  return id;
}
