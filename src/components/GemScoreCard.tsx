"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateGemScoreAction } from "@/app/actions/storeProfileActions";
import { Field, inputClass, btnOutline } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

interface GemScoreData {
  gem_taste_score: number | null;
  gem_taste_goal: number | null;
  gem_accuracy_score: number | null;
  gem_accuracy_goal: number | null;
  gem_updated_by_name: string | null;
  gem_updated_at: string | null;
}

function fmtNum(n: number | null, digits = 1): string {
  if (n === null) return "—";
  return n.toFixed(digits);
}

/** Unlike the P&L period card, this isn't tied to any one period -- GEM is
 * a live figure that can move day to day, so it's just "what's true right
 * now," editable any time a manager gets a new number, with no history of
 * past scores kept. */
export default function GemScoreCard({ lang, gem, canEdit, lastUpdatedLabel }: { lang: Language; gem: GemScoreData | undefined; canEdit: boolean; lastUpdatedLabel: string | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const es = lang === "es";

  const metrics = [
    { label: es ? "Sabor de Comida" : "Taste of Food", score: gem?.gem_taste_score ?? null, goal: gem?.gem_taste_goal ?? null },
    { label: es ? "Exactitud del Pedido" : "Accuracy of Order", score: gem?.gem_accuracy_score ?? null, goal: gem?.gem_accuracy_goal ?? null },
  ];

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await updateGemScoreAction(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setEditing(false);
            router.refresh();
          });
        }}
        className="card flex flex-col gap-3 p-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={es ? "Sabor de Comida — Puntaje" : "Taste of Food — Score"}>
            <input name="gemTasteScore" type="number" step="any" inputMode="decimal" defaultValue={gem?.gem_taste_score ?? undefined} className={inputClass} />
          </Field>
          <Field label={es ? "Sabor de Comida — Meta" : "Taste of Food — Goal"}>
            <input name="gemTasteGoal" type="number" step="any" inputMode="decimal" defaultValue={gem?.gem_taste_goal ?? undefined} className={inputClass} />
          </Field>
          <Field label={es ? "Exactitud del Pedido — Puntaje" : "Accuracy of Order — Score"}>
            <input name="gemAccuracyScore" type="number" step="any" inputMode="decimal" defaultValue={gem?.gem_accuracy_score ?? undefined} className={inputClass} />
          </Field>
          <Field label={es ? "Exactitud del Pedido — Meta" : "Accuracy of Order — Goal"}>
            <input name="gemAccuracyGoal" type="number" step="any" inputMode="decimal" defaultValue={gem?.gem_accuracy_goal ?? undefined} className={inputClass} />
          </Field>
        </div>
        {error && <p className="text-sm text-critical">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="tap-target flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "…" : t(lang, "action_save")}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-sm font-medium text-muted">
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{t(lang, "store_profile_gem_score")}</h2>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className={`shrink-0 gap-1 ${btnOutline}`}>
            ✎ {es ? "Editar" : "Edit"}
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {metrics.map((m) => {
          const overGoal = m.score !== null && m.goal !== null ? m.score - m.goal : null;
          return (
            <div key={m.label} className="card p-3">
              <p className="text-lg font-bold">{fmtNum(m.score)}</p>
              <p className="text-xs text-muted">{m.label}</p>
              {m.goal !== null && (
                <p className={`mt-1 text-xs font-semibold ${overGoal !== null && overGoal >= 0 ? "text-ok" : "text-critical"}`}>
                  {es ? "Meta" : "Goal"} {fmtNum(m.goal)}
                  {overGoal !== null && ` · ${overGoal >= 0 ? "+" : ""}${overGoal.toFixed(1)}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {lastUpdatedLabel && <p className="mt-2 text-xs text-muted">{lastUpdatedLabel}</p>}
    </div>
  );
}
