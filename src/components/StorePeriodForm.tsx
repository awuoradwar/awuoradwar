"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStorePeriodAction } from "@/app/actions/storeProfileActions";
import { Field, inputClass, textareaClass } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const NUMERIC_FIELDS = [
  "netSalesActual",
  "netSalesPlan",
  "netSalesPriorYear",
  "sssPct",
  "sstPct",
  "checkAverage",
  "cogsPct",
  "laborPct",
  "controllableProfitActual",
  "controllableProfitPct",
  "restaurantContribution",
  "gemScore",
] as const;

const NUMERIC_LABEL_KEY: Record<(typeof NUMERIC_FIELDS)[number], Parameters<typeof t>[1]> = {
  netSalesActual: "store_profile_net_sales",
  netSalesPlan: "store_profile_net_sales_plan",
  netSalesPriorYear: "store_profile_net_sales_prior_year",
  sssPct: "store_profile_sss",
  sstPct: "store_profile_sst",
  checkAverage: "store_profile_check_average",
  cogsPct: "store_profile_cogs_pct",
  laborPct: "store_profile_labor_pct",
  controllableProfitActual: "store_profile_cp_actual",
  controllableProfitPct: "store_profile_cp_pct",
  restaurantContribution: "store_profile_restaurant_contribution",
  gemScore: "store_profile_gem_score",
};

export default function StorePeriodForm({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createStorePeriodAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <Field label={t(lang, "store_profile_period_label")}>
        <input name="periodLabel" required placeholder={lang === "es" ? "ej. Período 8, 2026" : "e.g. Period 8, 2026"} className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {NUMERIC_FIELDS.map((field) => (
          <Field key={field} label={t(lang, NUMERIC_LABEL_KEY[field])}>
            <input name={field} type="number" step="any" inputMode="decimal" className={inputClass} />
          </Field>
        ))}
      </div>

      <Field label={t(lang, "store_profile_pnl_file")}>
        <input name="pnlFile" type="file" accept="application/pdf,image/*" className="text-sm" />
      </Field>

      <Field label={t(lang, "field_notes")}>
        <textarea name="notes" rows={2} className={textareaClass} />
      </Field>

      {error && <p className="text-sm text-critical">{error}</p>}
      <button type="submit" disabled={pending} className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60">
        {pending ? "…" : t(lang, "action_save")}
      </button>
    </form>
  );
}
