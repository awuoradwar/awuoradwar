import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { getLatestPeriod, getPeriodHistory, getGemScore, getWeeklyOtSummaryHistory, getWeeklyCogsSummaryHistory } from "@/lib/services/storeProfileService";
import { formatStoreDateTime, storeToday } from "@/lib/storeTime";
import { weekStartOf } from "@/lib/services/recurrenceService";
import StorePeriodForm from "@/components/StorePeriodForm";
import StorePeriodEditToggle from "@/components/StorePeriodEditToggle";
import GemScoreCard from "@/components/GemScoreCard";
import WeeklyOtSummaryCard from "@/components/WeeklyOtSummaryCard";
import WeeklyCogsSummaryCard from "@/components/WeeklyCogsSummaryCard";
import AttachmentViewerLink from "@/components/AttachmentViewerLink";
import PageHeader from "@/components/PageHeader";
import { t } from "@/lib/i18n";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Plain ratio (% of sales, like the P&L itself shows COGS/Labor/CP/RC) --
// never signed, since these aren't a comparison against anything. Negative
// still reads clearly since toFixed already carries its own minus sign.
function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}%`;
}

// A true period-over-period comparison (SSS, SST) -- signed so "up" vs
// "down" is unambiguous, unlike a plain ratio.
function fmtChangePct(n: number | null): string {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default async function StoreProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const latest = getLatestPeriod(user.storeId);
  const history = getPeriodHistory(user.storeId, 12);
  const gem = getGemScore(user.storeId);
  const gm = isGM(user);
  const es = user.language === "es";
  const locale = es ? "es-MX" : "en-US";

  const currentWeekStart = weekStartOf(storeToday(user.storeId));
  // COGS actual only exists once a week's Saturday inventory count is in --
  // it's always reported for the week that just ended, not the one
  // currently in progress, so its "primary" week is last week, not this one.
  const lastWeekStart = new Date(new Date(currentWeekStart + "T00:00:00Z").getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const otHistory = getWeeklyOtSummaryHistory(user.storeId, 24);
  const currentWeekOt = otHistory.find((w) => w.week_start === currentWeekStart);
  const upcomingOt = otHistory.filter((w) => w.week_start > currentWeekStart);
  const pastOt = otHistory.filter((w) => w.week_start < currentWeekStart);

  const cogsHistory = getWeeklyCogsSummaryHistory(user.storeId, 24);
  const primaryCogs = cogsHistory.find((w) => w.week_start === lastWeekStart);
  const upcomingCogs = cogsHistory.filter((w) => w.week_start > lastWeekStart);
  const pastCogs = cogsHistory.filter((w) => w.week_start < lastWeekStart);

  const kpis = latest
    ? [
        { label: t(user.language, "store_profile_net_sales"), value: fmtMoney(latest.net_sales_actual), negative: (latest.net_sales_actual ?? 0) < 0 },
        {
          label: t(user.language, "store_profile_net_sales_prior_year"),
          value: fmtMoney(latest.net_sales_prior_year),
          negative: (latest.net_sales_prior_year ?? 0) < 0,
        },
        { label: t(user.language, "store_profile_sss"), value: fmtChangePct(latest.sss_pct), negative: (latest.sss_pct ?? 0) < 0 },
        { label: t(user.language, "store_profile_sst"), value: fmtChangePct(latest.sst_pct), negative: (latest.sst_pct ?? 0) < 0 },
        { label: t(user.language, "store_profile_check_average"), value: latest.check_average === null ? "—" : `$${latest.check_average.toFixed(2)}`, negative: false },
        {
          label: t(user.language, "store_profile_cogs_pct"),
          value: fmtPct(latest.cogs_pct),
          negative: latest.cogs_pct !== null && latest.cogs_theoretical_pct !== null && latest.cogs_pct > latest.cogs_theoretical_pct,
        },
        { label: t(user.language, "store_profile_cogs_theoretical_pct"), value: fmtPct(latest.cogs_theoretical_pct), negative: false },
        { label: t(user.language, "store_profile_labor_pct"), value: fmtPct(latest.labor_pct), negative: false },
        {
          label: t(user.language, "store_profile_cp_actual"),
          value: fmtMoney(latest.controllable_profit_actual),
          negative: (latest.controllable_profit_actual ?? 0) < 0,
        },
        { label: t(user.language, "store_profile_cp_pct"), value: fmtPct(latest.controllable_profit_pct), negative: (latest.controllable_profit_pct ?? 0) < 0 },
        {
          label: t(user.language, "store_profile_restaurant_contribution"),
          value: fmtMoney(latest.restaurant_contribution),
          negative: (latest.restaurant_contribution ?? 0) < 0,
        },
        {
          label: t(user.language, "store_profile_restaurant_contribution_pct"),
          value: fmtPct(latest.restaurant_contribution_pct),
          negative: (latest.restaurant_contribution_pct ?? 0) < 0,
        },
      ]
    : [];

  const gemLastUpdated =
    gem?.gem_updated_at != null
      ? `${t(user.language, "field_last_updated_by")}: ${gem.gem_updated_by_name || "—"} · ${formatStoreDateTime(user.storeId, gem.gem_updated_at, locale)}`
      : null;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={t(user.language, "store_profile_title")} />
      <p className="-mt-3 mb-4 text-xs text-muted">{t(user.language, "store_profile_gm_only_note")}</p>

      <section className="mb-6">
        <GemScoreCard lang={user.language} gem={gem} canEdit={gm} lastUpdatedLabel={gemLastUpdated} />
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Horas Extra Semanal" : "Weekly Overtime"}</h2>
        <p className="mb-2 text-xs text-muted">
          {es
            ? "Normalmente se registra tan pronto se arma el horario de esa semana."
            : "Usually logged as soon as that week's schedule is built."}
        </p>
        <WeeklyOtSummaryCard summary={currentWeekOt} weekStart={currentWeekStart} canEdit={gm} lang={user.language} />
      </section>

      {upcomingOt.length > 0 && (
        <details className="card mb-6 overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{es ? "Próximas Semanas (OT)" : "Upcoming Weeks (OT)"}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">{upcomingOt.length}</span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {upcomingOt.map((w) => (
              <WeeklyOtSummaryCard key={w.id} summary={w} weekStart={w.week_start} canEdit={gm} lang={user.language} />
            ))}
          </div>
        </details>
      )}

      {pastOt.length > 0 && (
        <details className="card mb-6 overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{es ? "Historial de Horas Extra" : "OT History"}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">{pastOt.length}</span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {pastOt.map((w) => (
              <WeeklyOtSummaryCard key={w.id} summary={w} weekStart={w.week_start} canEdit={gm} lang={user.language} />
            ))}
          </div>
        </details>
      )}

      <section className="mb-6">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-accent">{es ? "COGS Semanal" : "Weekly COGS"}</h2>
        <p className="mb-2 text-xs text-muted">
          {es
            ? "El COGS real solo existe después del conteo de inventario del sábado -- siempre es de la semana que acaba de terminar."
            : "COGS actual only exists after Saturday's inventory count -- always for the week that just ended."}
        </p>
        <WeeklyCogsSummaryCard summary={primaryCogs} weekStart={lastWeekStart} canEdit={gm} lang={user.language} />
      </section>

      {upcomingCogs.length > 0 && (
        <details className="card mb-6 overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{es ? "Semanas Más Recientes (COGS)" : "More Recent Weeks (COGS)"}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">{upcomingCogs.length}</span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {upcomingCogs.map((w) => (
              <WeeklyCogsSummaryCard key={w.id} summary={w} weekStart={w.week_start} canEdit={gm} lang={user.language} />
            ))}
          </div>
        </details>
      )}

      {pastCogs.length > 0 && (
        <details className="card mb-6 overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{es ? "Historial de COGS" : "COGS History"}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">{pastCogs.length}</span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {pastCogs.map((w) => (
              <WeeklyCogsSummaryCard key={w.id} summary={w} weekStart={w.week_start} canEdit={gm} lang={user.language} />
            ))}
          </div>
        </details>
      )}

      <section className="mb-6">
        {!latest && (
          <>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "store_profile_latest")}</h2>
            <div className="card p-4 text-center text-sm text-muted">{t(user.language, "store_profile_no_data")}</div>
          </>
        )}
        {latest && (
          <StorePeriodEditToggle
            lang={user.language}
            period={latest}
            canEdit={gm}
            header={
              <h2 className="text-xs font-bold uppercase tracking-wide text-accent">
                {t(user.language, "store_profile_latest")} — {latest.period_label}
              </h2>
            }
          >
            <div>
              <div className="grid grid-cols-2 gap-3">
                {kpis.map((k) => (
                  <div key={k.label} className="card p-3">
                    <p className={`text-lg font-bold ${k.negative ? "text-critical" : ""}`}>{k.value}</p>
                    <p className="text-xs text-muted">{k.label}</p>
                  </div>
                ))}
              </div>
              {latest.pnl_file_ref && (
                <AttachmentViewerLink
                  href={`/api/store-pnl/${latest.id}`}
                  label={`📄 ${t(user.language, "store_profile_view_pnl")}`}
                  lang={user.language}
                  className="tap-target mt-3 flex w-full items-center justify-center rounded-xl border border-border text-sm font-medium text-accent"
                />
              )}
              {latest.notes && <p className="mt-3 text-sm text-muted">{latest.notes}</p>}
              <p className="mt-2 text-xs text-muted">
                {t(user.language, "field_last_updated_by")}: {latest.created_by_name || "—"}
              </p>
            </div>
          </StorePeriodEditToggle>
        )}
      </section>

      {history.length > 1 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "store_profile_history")}</h2>
          <div className="card divide-y divide-border text-sm">
            {history.slice(1).map((p) => (
              <div key={p.id} className="px-3 py-2">
                <StorePeriodEditToggle
                  lang={user.language}
                  period={p}
                  canEdit={gm}
                  header={
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.period_label}</p>
                      <p className="text-xs text-muted">
                        {fmtMoney(p.net_sales_actual)} · {t(user.language, "store_profile_sss")}: {fmtChangePct(p.sss_pct)}
                      </p>
                    </div>
                  }
                >
                  {null}
                </StorePeriodEditToggle>
              </div>
            ))}
          </div>
        </section>
      )}

      {gm && (
        <details className="card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "store_profile_add_period")}</span>
            <span className="shrink-0 text-xs text-muted">▾</span>
          </summary>
          <div className="border-t border-border p-3">
            <StorePeriodForm lang={user.language} />
          </div>
        </details>
      )}
    </div>
  );
}
