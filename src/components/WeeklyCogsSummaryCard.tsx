"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWeeklyCogsSummaryAction } from "@/app/actions/storeProfileActions";
import { WeeklyCogsSummary } from "@/lib/services/storeProfileService";
import { Field, inputClass, textareaClass, btnPrimary, btnOutline } from "./forms/FormShell";
import { Language } from "@/lib/types";

function fmtWeekRange(weekStart: string, locale: string): string {
  const s = new Date(weekStart + "T12:00:00Z");
  const e = new Date(s.getTime() + 6 * 86400000);
  const sameMonth = s.getMonth() === e.getMonth();
  const startFmt = s.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const endFmt = e.toLocaleDateString(locale, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${startFmt} – ${endFmt}`;
}

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

function WeeklyCogsSummaryForm({
  weekStart,
  summary,
  lang,
  onDone,
}: {
  weekStart: string;
  summary?: WeeklyCogsSummary;
  lang: Language;
  onDone: () => void;
}) {
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
          const result = await saveWeeklyCogsSummaryAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <Field label={lang === "es" ? "Semana que mide (cualquier día)" : "Week this measures (any day in it)"}>
        <input name="weekStart" type="date" required defaultValue={summary?.week_start ?? weekStart} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "COGS real %" : "COGS actual %"}>
          <input name="cogsActualPct" type="number" step="any" inputMode="decimal" defaultValue={summary?.cogs_actual_pct ?? undefined} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Meta de la empresa %" : "Company goal %"}>
          <input name="cogsGoalPct" type="number" step="any" inputMode="decimal" defaultValue={summary?.cogs_goal_pct ?? undefined} className={inputClass} />
        </Field>
      </div>
      <Field label={lang === "es" ? "Notas sobre variación de inventario (opcional)" : "Inventory variance notes (optional)"}>
        <textarea
          name="cogsNotes"
          rows={2}
          defaultValue={summary?.cogs_notes ?? undefined}
          placeholder={lang === "es" ? "Ej: merma por camión tardío, error de conteo" : "e.g. waste from a late truck, count error"}
          className={textareaClass}
        />
      </Field>

      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "…" : lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="text-sm font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

/** One week's COGS actual/goal, with a tap-to-edit form -- entering a week
 * that already has a row corrects it in place (see upsertWeeklyCogsSummary).
 * Kept separate from OT: COGS actual only exists once that week's Saturday
 * inventory count is in, so it's always logged for a week that's already
 * ended -- typically the week before whichever one is "current" when a
 * manager sits down to enter it. */
export default function WeeklyCogsSummaryCard({
  summary,
  weekStart,
  canEdit,
  lang,
  startOpenForEdit,
}: {
  summary?: WeeklyCogsSummary;
  weekStart: string;
  canEdit: boolean;
  lang: Language;
  startOpenForEdit?: boolean;
}) {
  const [editing, setEditing] = useState(!!startOpenForEdit);
  const locale = lang === "es" ? "es-MX" : "en-US";

  if (editing) {
    return <WeeklyCogsSummaryForm weekStart={weekStart} summary={summary} lang={lang} onDone={() => setEditing(false)} />;
  }

  if (!summary) {
    return (
      <div className="card flex items-center justify-between gap-2 p-3">
        <p className="text-sm text-muted">{lang === "es" ? "Sin datos para esta semana todavía." : "No data logged for this week yet."}</p>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className={`shrink-0 gap-1 ${btnOutline}`}>
            + {lang === "es" ? "Agregar" : "Add"}
          </button>
        )}
      </div>
    );
  }

  const variance = summary.cogs_actual_pct !== null && summary.cogs_goal_pct !== null ? summary.cogs_actual_pct - summary.cogs_goal_pct : null;

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{fmtWeekRange(summary.week_start, locale)}</p>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className={`shrink-0 gap-1 ${btnOutline}`}>
            ✎ {lang === "es" ? "Editar" : "Edit"}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-card-subtle p-2">
          <p className="text-xs text-muted">{lang === "es" ? "COGS real" : "COGS actual"}</p>
          <p className="text-sm font-bold">{fmtPct(summary.cogs_actual_pct)}</p>
        </div>
        <div className="rounded-lg bg-card-subtle p-2">
          <p className="text-xs text-muted">{lang === "es" ? "Meta" : "Goal"}</p>
          <p className="text-sm font-bold">{fmtPct(summary.cogs_goal_pct)}</p>
        </div>
        <div className="rounded-lg bg-card-subtle p-2">
          <p className="text-xs text-muted">{lang === "es" ? "Variación" : "Variance"}</p>
          <p className={`text-sm font-bold ${variance !== null && variance > 0 ? "text-critical" : ""}`}>
            {variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%`}
          </p>
        </div>
      </div>
      {summary.cogs_notes && <p className="mt-2 text-xs italic text-muted">{summary.cogs_notes}</p>}

      <p className="mt-3 text-xs text-muted">
        {lang === "es" ? "Actualizado por" : "Updated by"}: {summary.created_by_name || "—"}
      </p>
    </div>
  );
}
