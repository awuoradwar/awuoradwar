"use client";

import { useMemo, useState, useTransition } from "react";
import { submitProcedureAction } from "@/app/actions/procedureActions";
import { ProcedureArea, ProcedureCategory, ProcedureItem, ProcedureShiftType } from "@/lib/services/procedureService";

type Lang = "en" | "es";

const CATEGORY_LABEL: Record<ProcedureCategory, Record<Lang, string>> = {
  FOH: { en: "Front of House", es: "Área de Clientes" },
  BOH: { en: "Back of House", es: "Área de Cocina" },
  PATIO_WINDOWS: { en: "Patio & Windows", es: "Patio y Ventanas" },
};

type Step = "category" | "area" | "checklist" | "done";

function StepHeader({ step, total, label, lang }: { step: number; total: number; label: string; lang: Lang }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {lang === "es" ? `Paso ${step} de ${total}` : `Step ${step} of ${total}`}
      </p>
      <h1 className="mt-0.5 text-xl font-bold">{label}</h1>
    </div>
  );
}

const bigTile =
  "tap-target flex w-full items-center justify-between rounded-2xl border-2 border-border bg-card px-5 py-4 text-left text-lg font-semibold transition-colors hover:border-accent hover:bg-accent/5 active:bg-accent/10";

export default function ProcedureKiosk({ token, storeName, areas, itemsByAreaShift, categories }: {
  token: string;
  storeName: string;
  areas: ProcedureArea[];
  itemsByAreaShift: Record<string, ProcedureItem[]>;
  /** Only categories that currently have at least one active station --
   * Back of House and Patio & Windows aren't built out yet, and a category
   * that's only ever a dead end ("no areas set up") shouldn't be a tap on
   * the very first screen. When there's exactly one, that whole step is
   * skipped too, same reasoning as skipping the opening/closing tap. */
  categories: ProcedureCategory[];
}) {
  const singleCategory = categories.length === 1 ? categories[0] : null;
  const [lang, setLang] = useState<Lang>("en");
  const es = lang === "es";
  const [step, setStep] = useState<Step>(singleCategory ? "area" : "category");
  const [category, setCategory] = useState<ProcedureCategory | null>(singleCategory);
  const [area, setArea] = useState<ProcedureArea | null>(null);
  // Only closing procedures exist right now -- see the comment on `items`
  // below -- so this is fixed rather than a user choice. Kept as a real
  // ProcedureShiftType value (not a literal sprinkled through submit/JSX) so
  // opening support can come back later by turning this into a picker again.
  const shiftType: ProcedureShiftType = "CLOSING";
  const [name, setName] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const areasInCategory = useMemo(() => (category ? areas.filter((a) => a.category === category) : []), [areas, category]);
  // Only closing checklists exist right now -- opening procedures aren't
  // built out yet -- so the kiosk skips straight from picking a station to
  // its closing checklist instead of also asking opening-vs-closing.
  const items: ProcedureItem[] = area ? itemsByAreaShift[`${area.id}:${shiftType}`] || [] : [];
  const allChecked = items.length > 0 && items.every((i) => checked[i.id]);
  const uncheckedCount = items.filter((i) => !checked[i.id]).length;

  function itemLabel(item: ProcedureItem): string {
    return es && item.text_es ? item.text_es : item.text;
  }

  const totalSteps = singleCategory ? 2 : 3;
  const areaStepNum = singleCategory ? 1 : 2;
  const checklistStepNum = singleCategory ? 2 : 3;

  function reset() {
    setStep(singleCategory ? "area" : "category");
    setCategory(singleCategory);
    setArea(null);
    setName("");
    setChecked({});
    setNotes("");
    setError(null);
  }

  function submit() {
    if (!area) return;
    if (!name.trim()) {
      setError(es ? "Escribe tu nombre." : "Enter your name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitProcedureAction(
        token,
        area.id,
        shiftType,
        name,
        items.map((i) => ({ text: i.text, textEs: i.text_es, checked: !!checked[i.id] })),
        notes
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setStep("done");
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm font-semibold text-muted">{storeName}</p>
        <button
          type="button"
          onClick={() => setLang((l) => (l === "en" ? "es" : "en"))}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-accent"
        >
          {es ? "English" : "Español"}
        </button>
      </div>

      {step === "category" && (
        <>
          <StepHeader step={1} total={totalSteps} label={es ? "¿Para qué área es esto?" : "Which area is this for?"} lang={lang} />
          <div className="flex flex-col gap-3">
            {categories.length === 0 && (
              <p className="text-center text-sm text-muted">{es ? "Todavía no hay estaciones configuradas." : "No stations set up yet -- let your manager know."}</p>
            )}
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={bigTile}
                onClick={() => {
                  setCategory(c);
                  setStep("area");
                }}
              >
                {CATEGORY_LABEL[c][lang]}
                <span className="text-muted">→</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "area" && category && (
        <>
          <StepHeader step={areaStepNum} total={totalSteps} label={CATEGORY_LABEL[category][lang]} lang={lang} />
          <div className="flex flex-col gap-3">
            {areasInCategory.length === 0 && (
              <p className="text-center text-sm text-muted">{es ? "Todavía no hay áreas para esta categoría." : "No areas set up for this category yet."}</p>
            )}
            {areasInCategory.map((a) => (
              <button
                key={a.id}
                type="button"
                className={bigTile}
                onClick={() => {
                  setArea(a);
                  setStep("checklist");
                }}
              >
                {a.name}
                <span className="text-muted">→</span>
              </button>
            ))}
          </div>
          {!singleCategory && (
            <button type="button" onClick={() => setStep("category")} className="mt-6 text-sm font-medium text-muted">
              {es ? "← Atrás" : "← Back"}
            </button>
          )}
        </>
      )}

      {step === "checklist" && area && (
        <>
          <StepHeader step={checklistStepNum} total={totalSteps} label={`${area.name} — ${es ? "Cierre" : "Closing"}`} lang={lang} />
          <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium">
            {es ? "Tu nombre" : "Your name"}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={es ? "Nombre completo" : "Full name"}
              className="tap-target rounded-xl border border-border bg-card px-3.5 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
              {es ? "Todavía no hay una lista para esto -- avísale a tu gerente." : "No checklist has been set up for this yet -- let your manager know."}
            </p>
          ) : (
            <div className="card divide-y divide-border">
              {items.map((item) => (
                <label key={item.id} className="tap-target flex items-center gap-3 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!!checked[item.id]}
                    onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
                    className="h-5 w-5 shrink-0 accent-accent"
                  />
                  <span className={checked[item.id] ? "text-muted line-through" : ""}>{itemLabel(item)}</span>
                </label>
              ))}
            </div>
          )}
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
            {es ? "Notas (opcional)" : "Notes (optional)"}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={es ? "Algo que el gerente deba saber" : "Anything a manager should know"}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>
          {!allChecked && items.length > 0 && (
            <p className="mt-3 text-xs text-warning">
              {es
                ? `${uncheckedCount} paso${uncheckedCount === 1 ? "" : "s"} sin marcar -- puedes enviarlo de todos modos.`
                : `${uncheckedCount} step${uncheckedCount === 1 ? "" : "s"} not checked -- you can still submit.`}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-critical">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="tap-target mt-4 rounded-xl bg-accent text-base font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? (es ? "Enviando…" : "Submitting…") : es ? "Enviar lista" : "Submit checklist"}
          </button>
          <button type="button" onClick={() => setStep("area")} disabled={pending} className="mt-4 text-sm font-medium text-muted">
            {es ? "← Atrás" : "← Back"}
          </button>
        </>
      )}

      {step === "done" && area && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok/10 text-3xl text-ok">✓</div>
          <h1 className="text-xl font-bold">{es ? "Enviado" : "Submitted"}</h1>
          <p className="mt-1 text-sm text-muted">
            {area.name} · {es ? "Cierre" : "Closing"}
            {es ? " registrado para " : " checklist recorded for "}
            {name.trim()}.
          </p>
          <button type="button" onClick={reset} className="tap-target mt-8 rounded-xl bg-accent px-6 text-base font-semibold text-accent-foreground shadow-sm hover:bg-accent-hover">
            {es ? "Enviar otro" : "Submit another"}
          </button>
        </div>
      )}
    </div>
  );
}
