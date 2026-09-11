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

function fmtShortDate(dateStr: string, locale: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "";
}

const bigTile =
  "tap-target flex w-full items-center justify-between rounded-2xl border-2 border-border bg-card px-5 py-4 text-left text-lg font-semibold transition-colors hover:border-accent hover:bg-accent/5 active:bg-accent/10";

export default function ProcedureKiosk({ token, storeName, areas, itemsByAreaShift, categories, todayDate, yesterdayDate, lateNightWindow }: {
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
  todayDate: string;
  yesterdayDate: string;
  /** Store-local hour is before the cutoff (see procedures/[token]/page.tsx)
   * -- a closing submitted right now is more likely finishing up last
   * night's shift than starting today's, so the checklist step asks which
   * night this is for instead of silently assuming today. */
  lateNightWindow: boolean;
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
  // Two name fields always show -- most stations only ever fill in the
  // first, and leaving the second blank keeps items as plain checkboxes.
  // Filling both (stations like Cooks where two people split the list)
  // switches items to per-person chips so it's clear who did what.
  const [names, setNames] = useState<[string, string]>(["", ""]);
  const [checkedBy, setCheckedBy] = useState<Record<string, string | undefined>>({});
  const [notes, setNotes] = useState("");
  const [submittedDate, setSubmittedDate] = useState(lateNightWindow ? yesterdayDate : todayDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const areasInCategory = useMemo(() => (category ? areas.filter((a) => a.category === category) : []), [areas, category]);
  // Only closing checklists exist right now -- opening procedures aren't
  // built out yet -- so the kiosk skips straight from picking a station to
  // its closing checklist instead of also asking opening-vs-closing.
  const items: ProcedureItem[] = area ? itemsByAreaShift[`${area.id}:${shiftType}`] || [] : [];
  const activeNames = names.map((n) => n.trim()).filter(Boolean);
  const multiAssociate = activeNames.length >= 2;
  const allChecked = items.length > 0 && items.every((i) => checkedBy[i.id]);
  const uncheckedCount = items.filter((i) => !checkedBy[i.id]).length;

  function itemLabel(item: ProcedureItem): string {
    return es && item.text_es ? item.text_es : item.text;
  }

  const locale = es ? "es-MX" : "en-US";
  const totalSteps = singleCategory ? 2 : 3;
  const areaStepNum = singleCategory ? 1 : 2;
  const checklistStepNum = singleCategory ? 2 : 3;

  function reset() {
    setStep(singleCategory ? "area" : "category");
    setCategory(singleCategory);
    setArea(null);
    setNames(["", ""]);
    setCheckedBy({});
    setNotes("");
    setSubmittedDate(lateNightWindow ? yesterdayDate : todayDate);
    setError(null);
  }

  function toggleItem(itemId: string, by: string) {
    setCheckedBy((c) => ({ ...c, [itemId]: c[itemId] === by ? undefined : by }));
  }

  function submit() {
    if (!area) return;
    if (activeNames.length === 0) {
      setError(es ? "Escribe tu nombre." : "Enter your name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitProcedureAction(
        token,
        area.id,
        shiftType,
        activeNames.join(" & "),
        items.map((i) => ({ text: i.text, textEs: i.text_es, checked: !!checkedBy[i.id], checkedBy: checkedBy[i.id] ?? null })),
        notes,
        submittedDate
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
          <button type="button" onClick={() => setStep("area")} disabled={pending} className="-mt-3 mb-4 self-start text-sm font-medium text-muted">
            {es ? "← Atrás" : "← Back"}
          </button>
          {lateNightWindow && (
            <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
                {es ? "¿Qué noche cerraste?" : "Which night did you close?"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubmittedDate(yesterdayDate)}
                  className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${
                    submittedDate === yesterdayDate ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted"
                  }`}
                >
                  {es ? "Anoche" : "Last night"} · {fmtShortDate(yesterdayDate, locale)}
                </button>
                <button
                  type="button"
                  onClick={() => setSubmittedDate(todayDate)}
                  className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${
                    submittedDate === todayDate ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted"
                  }`}
                >
                  {es ? "Esta noche" : "Tonight"} · {fmtShortDate(todayDate, locale)}
                </button>
              </div>
            </div>
          )}
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-sm font-medium">{es ? "Nombre(s)" : "Name(s)"}</p>
            <input
              value={names[0]}
              onChange={(e) => setNames((prev) => [e.target.value, prev[1]])}
              placeholder={es ? "Nombre completo" : "Full name"}
              className="tap-target rounded-xl border border-border bg-card px-3.5 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <input
              value={names[1]}
              onChange={(e) => setNames((prev) => [prev[0], e.target.value])}
              placeholder={es ? "Segundo asociado (si aplica)" : "Second associate (if any)"}
              className="tap-target rounded-xl border border-border bg-card px-3.5 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </div>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
              {es ? "Todavía no hay una lista para esto -- avísale a tu gerente." : "No checklist has been set up for this yet -- let your manager know."}
            </p>
          ) : multiAssociate ? (
            <div className="card divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                  <span className={`flex-1 ${checkedBy[item.id] ? "text-muted line-through" : ""}`}>{itemLabel(item)}</span>
                  <div className="flex shrink-0 gap-1.5">
                    {activeNames.map((n) => {
                      const first = firstName(n);
                      const active = checkedBy[item.id] === first;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => toggleItem(item.id, first)}
                          className={`tap-target rounded-lg border-2 px-2.5 text-xs font-semibold transition-colors ${
                            active ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted"
                          }`}
                        >
                          {first}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card divide-y divide-border">
              {items.map((item) => (
                <label key={item.id} className="tap-target flex items-center gap-3 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!!checkedBy[item.id]}
                    onChange={(e) => setCheckedBy((c) => ({ ...c, [item.id]: e.target.checked ? firstName(names[0]) : undefined }))}
                    className="h-5 w-5 shrink-0 accent-accent"
                  />
                  <span className={checkedBy[item.id] ? "text-muted line-through" : ""}>{itemLabel(item)}</span>
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
        </>
      )}

      {step === "done" && area && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok/10 text-3xl text-ok">✓</div>
          <h1 className="text-xl font-bold">{es ? "Enviado" : "Submitted"}</h1>
          <p className="mt-1 text-sm text-muted">
            {area.name} · {es ? "Cierre" : "Closing"}
            {es ? " registrado para " : " checklist recorded for "}
            {names.map((n) => n.trim()).filter(Boolean).join(" & ")}.
          </p>
          <button type="button" onClick={reset} className="tap-target mt-8 rounded-xl bg-accent px-6 text-base font-semibold text-accent-foreground shadow-sm hover:bg-accent-hover">
            {es ? "Enviar otro" : "Submit another"}
          </button>
        </div>
      )}
    </div>
  );
}
