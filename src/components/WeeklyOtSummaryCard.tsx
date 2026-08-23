"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWeeklyOtSummaryAction } from "@/app/actions/storeProfileActions";
import { WeeklyOtSummary } from "@/lib/services/storeProfileService";
import { Field, inputClass, textareaClass, btnPrimary, btnOutline } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";

function fmtWeekRange(weekStart: string, locale: string): string {
  const s = new Date(weekStart + "T12:00:00Z");
  const e = new Date(s.getTime() + 6 * 86400000);
  const sameMonth = s.getMonth() === e.getMonth();
  const startFmt = s.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const endFmt = e.toLocaleDateString(locale, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${startFmt} – ${endFmt}`;
}

function fmtHours(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}h`;
}

function WeeklyOtSummaryForm({
  weekStart,
  summary,
  lang,
  onDone,
}: {
  weekStart: string;
  summary?: WeeklyOtSummary;
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
          const result = await saveWeeklyOtSummaryAction(fd);
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
      <Field label={lang === "es" ? "Semana (cualquier día)" : "Week (any day in it)"}>
        <DateField name="weekStart" required defaultValue={summary?.week_start ?? weekStart} lang={lang} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "FOH (horas)" : "FOH (hours)"}>
          <input name="otFohHours" type="number" step="any" inputMode="decimal" defaultValue={summary?.ot_foh_hours ?? undefined} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "BOH (horas)" : "BOH (hours)"}>
          <input name="otBohHours" type="number" step="any" inputMode="decimal" defaultValue={summary?.ot_boh_hours ?? undefined} className={inputClass} />
        </Field>
      </div>
      <Field label={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}>
        <textarea name="otNotes" rows={2} defaultValue={summary?.ot_notes ?? undefined} placeholder={lang === "es" ? "Ej: cubrimos una llamada, capacitación extra" : "e.g. covered a call-in, extra training"} className={textareaClass} />
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

/** One week's OT figures, with a tap-to-edit form -- entering a week that
 * already has a row corrects it in place (see upsertWeeklyOtSummary), so
 * this doubles as both "add this week" and "fix an earlier week's numbers"
 * without two different UIs. Kept separate from COGS: OT is normally logged
 * for the week whose schedule was just built (often before or right as that
 * week starts), which is a different week than COGS actual is ever about. */
export default function WeeklyOtSummaryCard({
  summary,
  weekStart,
  canEdit,
  lang,
  startOpenForEdit,
}: {
  summary?: WeeklyOtSummary;
  weekStart: string;
  canEdit: boolean;
  lang: Language;
  startOpenForEdit?: boolean;
}) {
  const [editing, setEditing] = useState(!!startOpenForEdit);
  const locale = lang === "es" ? "es-MX" : "en-US";

  if (editing) {
    return <WeeklyOtSummaryForm weekStart={weekStart} summary={summary} lang={lang} onDone={() => setEditing(false)} />;
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

  const totalOt = (summary.ot_foh_hours ?? 0) + (summary.ot_boh_hours ?? 0);
  const hasOt = summary.ot_foh_hours !== null || summary.ot_boh_hours !== null;

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
          <p className="text-xs text-muted">FOH OT</p>
          <p className="text-sm font-bold">{fmtHours(summary.ot_foh_hours)}</p>
        </div>
        <div className="rounded-lg bg-card-subtle p-2">
          <p className="text-xs text-muted">BOH OT</p>
          <p className="text-sm font-bold">{fmtHours(summary.ot_boh_hours)}</p>
        </div>
        <div className="rounded-lg bg-card-subtle p-2">
          <p className="text-xs text-muted">{lang === "es" ? "Total" : "Total"} OT</p>
          <p className="text-sm font-bold">{hasOt ? fmtHours(totalOt) : "—"}</p>
        </div>
      </div>
      {summary.ot_notes && <p className="mt-2 text-xs italic text-muted">{summary.ot_notes}</p>}

      <p className="mt-3 text-xs text-muted">
        {lang === "es" ? "Actualizado por" : "Updated by"}: {summary.created_by_name || "—"}
      </p>
    </div>
  );
}
