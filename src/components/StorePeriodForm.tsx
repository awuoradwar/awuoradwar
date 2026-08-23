"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStorePeriodAction, updateStorePeriodAction } from "@/app/actions/storeProfileActions";
import { Field, inputClass, textareaClass, FileField } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const NUMERIC_FIELDS = [
  "netSalesActual",
  "netSalesPriorYear",
  "sssPct",
  "sstPct",
  "checkAverage",
  "cogsPct",
  "cogsTheoreticalPct",
  "laborPct",
  "controllableProfitActual",
  "controllableProfitPct",
  "restaurantContribution",
  "restaurantContributionPct",
] as const;

const NUMERIC_LABEL_KEY: Record<(typeof NUMERIC_FIELDS)[number], Parameters<typeof t>[1]> = {
  netSalesActual: "store_profile_net_sales",
  netSalesPriorYear: "store_profile_net_sales_prior_year",
  sssPct: "store_profile_sss",
  sstPct: "store_profile_sst",
  checkAverage: "store_profile_check_average",
  cogsPct: "store_profile_cogs_pct",
  cogsTheoreticalPct: "store_profile_cogs_theoretical_pct",
  laborPct: "store_profile_labor_pct",
  controllableProfitActual: "store_profile_cp_actual",
  controllableProfitPct: "store_profile_cp_pct",
  restaurantContribution: "store_profile_restaurant_contribution",
  restaurantContributionPct: "store_profile_restaurant_contribution_pct",
};

export interface StorePeriodDefaults {
  id: string;
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
  released_at: string | null;
  notes: string | null;
}

const NUMERIC_DB_KEY: Record<(typeof NUMERIC_FIELDS)[number], keyof StorePeriodDefaults> = {
  netSalesActual: "net_sales_actual",
  netSalesPriorYear: "net_sales_prior_year",
  sssPct: "sss_pct",
  sstPct: "sst_pct",
  checkAverage: "check_average",
  cogsPct: "cogs_pct",
  cogsTheoreticalPct: "cogs_theoretical_pct",
  laborPct: "labor_pct",
  controllableProfitActual: "controllable_profit_actual",
  controllableProfitPct: "controllable_profit_pct",
  restaurantContribution: "restaurant_contribution",
  restaurantContributionPct: "restaurant_contribution_pct",
};

export default function StorePeriodForm({ lang, period, onDone }: { lang: Language; period?: StorePeriodDefaults; onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isEdit = !!period;
  // DateField manages its own React state, not a native defaultValue a plain
  // form.reset() can touch -- bumping this key after a successful create
  // remounts the release-date field fresh, same as the rest of the form.
  const [resetKey, setResetKey] = useState(0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = isEdit ? await updateStorePeriodAction(fd) : await createStorePeriodAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          if (!isEdit) {
            (e.target as HTMLFormElement).reset();
            setResetKey((k) => k + 1);
          }
          router.refresh();
          onDone?.();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      {isEdit && <input type="hidden" name="id" value={period.id} />}
      <Field label={t(lang, "store_profile_period_label")}>
        <input
          name="periodLabel"
          required
          defaultValue={period?.period_label}
          placeholder={lang === "es" ? "ej. Período 8, 2026" : "e.g. Period 8, 2026"}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {NUMERIC_FIELDS.map((field) => (
          <Field key={field} label={t(lang, NUMERIC_LABEL_KEY[field])}>
            <input name={field} type="number" step="any" inputMode="decimal" defaultValue={period?.[NUMERIC_DB_KEY[field]] ?? undefined} className={inputClass} />
          </Field>
        ))}
      </div>

      <Field label={lang === "es" ? "Fecha de lanzamiento" : "Release date"}>
        <DateField key={resetKey} name="releasedAt" defaultValue={period?.released_at ?? ""} lang={lang} />
        <p className="mt-1 text-xs text-muted">
          {lang === "es"
            ? "La fecha real en que corporativo publicó este período (normalmente el primer viernes). Se usa para el aviso de 'Publicado esta semana'."
            : "The actual date corporate released this period (usually the first Friday). Drives the \"Released this week\" badge."}
        </p>
      </Field>

      <Field label={t(lang, "store_profile_pnl_file")}>
        <FileField name="pnlFile" accept="application/pdf,image/*" lang={lang} />
        {isEdit && <p className="mt-1 text-xs text-muted">{lang === "es" ? "Deja en blanco para conservar el archivo actual." : "Leave blank to keep the current file."}</p>}
      </Field>

      <Field label={t(lang, "field_notes")}>
        <textarea name="notes" rows={2} defaultValue={period?.notes ?? undefined} className={textareaClass} />
      </Field>

      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="tap-target flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "…" : t(lang, "action_save")}
        </button>
        {isEdit && (
          <button type="button" onClick={onDone} disabled={pending} className="text-sm font-medium text-muted">
            {lang === "es" ? "Cancelar" : "Cancel"}
          </button>
        )}
      </div>
    </form>
  );
}
