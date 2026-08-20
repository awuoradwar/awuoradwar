import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { getLatestPeriod, getPeriodHistory, getGemScore } from "@/lib/services/storeProfileService";
import { formatStoreDateTime } from "@/lib/storeTime";
import StorePeriodForm from "@/components/StorePeriodForm";
import StorePeriodEditToggle from "@/components/StorePeriodEditToggle";
import GemScoreCard from "@/components/GemScoreCard";
import PageHeader from "@/components/PageHeader";
import { t } from "@/lib/i18n";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null): string {
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

  const kpis = latest
    ? [
        { label: t(user.language, "store_profile_net_sales"), value: fmtMoney(latest.net_sales_actual) },
        { label: t(user.language, "store_profile_net_sales_prior_year"), value: fmtMoney(latest.net_sales_prior_year) },
        { label: t(user.language, "store_profile_sss"), value: fmtPct(latest.sss_pct) },
        { label: t(user.language, "store_profile_sst"), value: fmtPct(latest.sst_pct) },
        { label: t(user.language, "store_profile_check_average"), value: latest.check_average === null ? "—" : `$${latest.check_average.toFixed(2)}` },
        { label: t(user.language, "store_profile_cogs_pct"), value: fmtPct(latest.cogs_pct) },
        { label: t(user.language, "store_profile_labor_pct"), value: fmtPct(latest.labor_pct) },
        { label: t(user.language, "store_profile_cp_actual"), value: fmtMoney(latest.controllable_profit_actual) },
        { label: t(user.language, "store_profile_cp_pct"), value: fmtPct(latest.controllable_profit_pct) },
        { label: t(user.language, "store_profile_restaurant_contribution"), value: fmtMoney(latest.restaurant_contribution) },
        { label: t(user.language, "store_profile_restaurant_contribution_pct"), value: fmtPct(latest.restaurant_contribution_pct) },
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
                    <p className="text-lg font-bold">{k.value}</p>
                    <p className="text-xs text-muted">{k.label}</p>
                  </div>
                ))}
              </div>
              {latest.pnl_file_ref && (
                <a
                  href={`/api/store-pnl/${latest.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-target mt-3 flex items-center justify-center rounded-xl border border-border text-sm font-medium text-accent"
                >
                  📄 {t(user.language, "store_profile_view_pnl")}
                </a>
              )}
              {latest.notes && <p className="mt-3 text-sm text-muted">{latest.notes}</p>}
              <p className="mt-2 text-xs text-muted">
                {t(user.language, "field_last_updated_by")}: {latest.created_by_name || "—"}
              </p>
            </div>
          </StorePeriodEditToggle>
        )}
      </section>

      {gm && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "store_profile_add_period")}</h2>
          <StorePeriodForm lang={user.language} />
        </section>
      )}

      {history.length > 1 && (
        <section>
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
                        {fmtMoney(p.net_sales_actual)} · {t(user.language, "store_profile_sss")}: {fmtPct(p.sss_pct)}
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
    </div>
  );
}
