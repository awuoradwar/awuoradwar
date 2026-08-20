"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTrainingItemAction, updateTrainingCompletionAction } from "@/app/actions/trainingActions";
import { TrainingChecklistRow, TrainingShiftType } from "@/lib/services/trainingService";
import { Field, inputClass, selectClass, btnPrimary } from "./forms/FormShell";
import { Language } from "@/lib/types";

const SHIFT_LABEL: Record<TrainingShiftType, Record<Language, string>> = {
  MORNING: { en: "Morning", es: "Mañana" },
  EVENING: { en: "Evening", es: "Tarde/Noche" },
  DOUBLE: { en: "Double", es: "Doble" },
};

/** Date/shift/notes on a trained checklist item are all correctable
 * afterward -- the trained checkbox just stamps "now" the moment it's
 * tapped, but a manager is often logging training that happened earlier
 * (a different day, a different shift than when they're checking the box),
 * and may want to flag "needs follow-up/retraining" without un-checking it
 * (which would misrepresent that the training never happened at all). */
function CompletionEditor({
  traineeId,
  itemId,
  trainedAt,
  shiftType,
  notes,
  lang,
  onDone,
}: {
  traineeId: string;
  itemId: string;
  trainedAt: string;
  shiftType: TrainingShiftType | null;
  notes: string;
  lang: Language;
  onDone: () => void;
}) {
  // Browser-local calendar date, matching how the trained-by line itself
  // already renders trainedAt (a client component -- the phone's own
  // timezone is the store's, since that's where it physically is).
  const d = new Date(trainedAt);
  const [date, setDate] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  const [shift, setShift] = useState<TrainingShiftType | "">(shiftType || "");
  const [draftNotes, setDraftNotes] = useState(notes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label={lang === "es" ? "Fecha" : "Date"}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} h-8 text-xs`} />
        </Field>
        <Field label={lang === "es" ? "Turno" : "Shift"}>
          <select value={shift} onChange={(e) => setShift(e.target.value as TrainingShiftType)} className={`${selectClass} h-8 text-xs`}>
            <option value="">{lang === "es" ? "Sin especificar" : "Unspecified"}</option>
            {(Object.keys(SHIFT_LABEL) as TrainingShiftType[]).map((s) => (
              <option key={s} value={s}>
                {SHIFT_LABEL[s][lang]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <input
        value={draftNotes}
        onChange={(e) => setDraftNotes(e.target.value)}
        placeholder={lang === "es" ? "Ej: necesita repaso en velocidad de caja" : "e.g. needs follow-up on register speed"}
        className={`${inputClass} h-8 text-xs`}
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !date}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await updateTrainingCompletionAction(traineeId, itemId, date, shift, draftNotes);
              if (result && "error" in result && result.error) {
                setError(result.error);
                return;
              }
              onDone();
              router.refresh();
            });
          }}
          className={`${btnPrimary} h-8 px-3 text-xs`}
        >
          {lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="text-xs font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

export default function TrainingChecklist({
  traineeId,
  items,
  lang,
}: {
  traineeId: string;
  items: TrainingChecklistRow[];
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  // Keyed by item id -- overrides only the items actually tapped this page
  // load; every other item still reflects the server prop.
  const [optimisticTrained, setOptimisticTrained] = useState<Record<string, boolean>>({});
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const router = useRouter();

  function toggle(itemId: string, currentlyTrained: boolean) {
    setOptimisticTrained((prev) => ({ ...prev, [itemId]: !currentlyTrained }));
    startTransition(async () => {
      try {
        await toggleTrainingItemAction(traineeId, itemId);
      } catch {
        setOptimisticTrained((prev) => ({ ...prev, [itemId]: currentlyTrained }));
      }
      router.refresh();
    });
  }

  return (
    <div className="card divide-y divide-border">
      {items.map((it) => {
        const trained = optimisticTrained[it.id] ?? !!it.trained_at;
        const label = lang === "es" && it.title_es ? it.title_es : it.title;
        return (
          <div key={it.id} className="flex flex-col gap-1.5 px-3 py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(it.id, trained)}
              className="tap-target flex w-full items-start gap-3 text-left disabled:opacity-60"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                  trained ? "border-ok bg-ok text-background" : "border-border text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-sm">{label}</p>
                {trained && it.trained_at && (
                  <p className="text-xs text-muted">
                    {lang === "es" ? "Capacitado por" : "Trained by"} {it.trained_by_name || "—"} ·{" "}
                    {new Date(it.trained_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}
                    {it.shift_type ? ` · ${SHIFT_LABEL[it.shift_type][lang]}` : ""}
                  </p>
                )}
              </span>
            </button>
            {trained &&
              (editingFor === it.id ? (
                <div className="pl-8">
                  <CompletionEditor
                    traineeId={traineeId}
                    itemId={it.id}
                    trainedAt={it.trained_at || new Date().toISOString()}
                    shiftType={it.shift_type}
                    notes={it.notes || ""}
                    lang={lang}
                    onDone={() => setEditingFor(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-8">
                  {it.notes ? (
                    <p className="min-w-0 flex-1 truncate text-xs italic text-muted">{it.notes}</p>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <button type="button" onClick={() => setEditingFor(it.id)} className="shrink-0 text-xs font-semibold text-accent">
                    ✎ {lang === "es" ? "Editar" : "Edit"}
                  </button>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
