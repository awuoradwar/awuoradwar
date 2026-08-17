import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export interface StorePnlPeriod {
  id: string;
  store_id: string;
  period_label: string;
  net_sales_actual: number | null;
  net_sales_plan: number | null;
  net_sales_prior_year: number | null;
  sss_pct: number | null;
  sst_pct: number | null;
  check_average: number | null;
  cogs_pct: number | null;
  labor_pct: number | null;
  controllable_profit_actual: number | null;
  controllable_profit_pct: number | null;
  restaurant_contribution: number | null;
  gem_taste_score: number | null;
  gem_taste_goal: number | null;
  gem_accuracy_score: number | null;
  gem_accuracy_goal: number | null;
  pnl_file_ref: string | null;
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
  netSalesPlan: number | null;
  netSalesPriorYear: number | null;
  sssPct: number | null;
  sstPct: number | null;
  checkAverage: number | null;
  cogsPct: number | null;
  laborPct: number | null;
  controllableProfitActual: number | null;
  controllableProfitPct: number | null;
  restaurantContribution: number | null;
  gemTasteScore: number | null;
  gemTasteGoal: number | null;
  gemAccuracyScore: number | null;
  gemAccuracyGoal: number | null;
  pnlFileRef: string | null;
  notes: string | null;
  actor: SessionUser;
}): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO store_pnl_periods (
      id, store_id, period_label, net_sales_actual, net_sales_plan, net_sales_prior_year,
      sss_pct, sst_pct, check_average, cogs_pct, labor_pct,
      controllable_profit_actual, controllable_profit_pct, restaurant_contribution,
      gem_taste_score, gem_taste_goal, gem_accuracy_score, gem_accuracy_goal,
      pnl_file_ref, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.periodLabel,
    params.netSalesActual,
    params.netSalesPlan,
    params.netSalesPriorYear,
    params.sssPct,
    params.sstPct,
    params.checkAverage,
    params.cogsPct,
    params.laborPct,
    params.controllableProfitActual,
    params.controllableProfitPct,
    params.restaurantContribution,
    params.gemTasteScore,
    params.gemTasteGoal,
    params.gemAccuracyScore,
    params.gemAccuracyGoal,
    params.pnlFileRef,
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
