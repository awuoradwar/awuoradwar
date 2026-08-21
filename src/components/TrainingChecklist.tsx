"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTrainingItemAction, updateTrainingCompletionAction, retrainTrainingItemAction } from "@/app/actions/trainingActions";
import { TrainingChecklistRow, TrainingShiftType } from "@/lib/services/trainingService";
import { Field, inputClass, selectClass, btnPrimary } from "./forms/FormShell";
import { Language } from "@/lib/types";

const SHIFT_LABEL: Record<TrainingShiftType, Record<Language, string>> = {
  MORNING: { en: "Morning", es: "Mañana" },
  EVENING: { en: "Evening", es: "Tarde/Noche" },
  DOUBLE: { en: "Double", es: "Doble" },
};

interface ManagerOption {
  id: string;
  name: string;
}

/** Date/shift/trained-by/notes on a trained checklist item are all
 * correctable afterward -- the trained checkbox just stamps "now" and the
 * person tapping it as trained_by, but a manager filling in the record
 * later is very often not who actually did the training, and is often
 * logging training that happened earlier (a different day, a different
 * shift). Notes let a manager flag "needs follow-up/retraining" without
 * un-checking the item (which would misrepresent that training never
 * happened at all). */
function CompletionEditor({
  traineeId,
  itemId,
  trainedAt,
  shiftType,
  trainedBy,
  notes,
  managers,
  lang,
  onDone,
}: {
  traineeId: string;
  itemId: string;
  trainedAt: string;
  shiftType: TrainingShiftType | null;
  trainedBy: string | null;
  notes: string;
  managers: ManagerOption[];
  lang: Language;
  onDone: () => void;
}) {
  // Browser-local calendar date, matching how the trained-by line itself
  // already renders trainedAt (a client component -- the phone's own
  // timezone is the store's, since that's where it physically is).
  const d = new Date(trainedAt);
  const [date, setDate] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  const [shift, setShift] = useState<TrainingShiftType | "">(shiftType || "");
  const [trainer, setTrainer] = useState(trainedBy || "");
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
      <Field label={lang === "es" ? "Capacitado por" : "Trained by"}>
        <select value={trainer} onChange={(e) => setTrainer(e.target.value)} className={`${selectClass} h-8 text-xs`}>
          <option value="">{lang === "es" ? "Sin especificar" : "Unspecified"}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
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
              const result = await updateTrainingCompletionAction(traineeId, itemId, date, shift, trainer, draftNotes);
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
  managers,
  lang,
}: {
  traineeId: string;
  items: TrainingChecklistRow[];
  managers: ManagerOption[];
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  // Keyed by item id -- overrides only the items actually tapped this page
  // load; every other item still reflects the server prop.
  const [optimisticTrained, setOptimisticTrained] = useState<Record<string, boolean>>({});
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [retrainingFor, setRetrainingFor] = useState<string | null>(null);
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

  function retrain(itemId: string) {
    setRetrainingFor(itemId);
    startTransition(async () => {
      await retrainTrainingItemAction(traineeId, itemId);
      setRetrainingFor(null);
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
            {/* Only the checkbox itself toggles trained/untrained -- the
                title used to be part of the same giant tap target, so
                tapping it to read more (there's nothing more to read, but
                that wasn't obvious) silently flipped the checkbox instead. */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(it.id, trained)}
                title={trained ? (lang === "es" ? "Marcar como no capacitado" : "Mark as not trained") : lang === "es" ? "Marcar como capacitado" : "Mark as trained"}
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                  trained ? "border-ok bg-ok text-background" : "border-border text-transparent hover:border-accent"
                }`}
              >
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{label}</p>
                {trained && it.trained_at && (
                  <p className="text-xs text-muted">
                    {lang === "es" ? "Capacitado por" : "Trained by"} {it.trained_by_name || "—"} ·{" "}
                    {new Date(it.trained_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}
                    {it.shift_type ? ` · ${SHIFT_LABEL[it.shift_type][lang]}` : ""}
                  </p>
                )}
              </div>
            </div>
            {trained &&
              (editingFor === it.id ? (
                <div className="pl-10">
                  <CompletionEditor
                    traineeId={traineeId}
                    itemId={it.id}
                    trainedAt={it.trained_at || new Date().toISOString()}
                    shiftType={it.shift_type}
                    trainedBy={it.trained_by}
                    notes={it.notes || ""}
                    managers={managers}
                    lang={lang}
                    onDone={() => setEditingFor(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-10">
                  {it.notes ? (
                    <p className="min-w-0 flex-1 truncate text-xs italic text-muted">{it.notes}</p>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => retrain(it.id)}
                    className="shrink-0 text-xs font-semibold text-accent disabled:opacity-60"
                  >
                    {retrainingFor === it.id ? "…" : `↻ ${lang === "es" ? "Recapacitado" : "Retrained"}`}
                  </button>
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
