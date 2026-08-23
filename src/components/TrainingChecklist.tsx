"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleTrainingItemAction,
  updateTrainingCompletionAction,
  retrainTrainingItemAction,
  updateTrainingLogEntryAction,
} from "@/app/actions/trainingActions";
import { TrainingChecklistRow, TrainingCompletionLogEntry, TrainingItemPhase, TrainingShiftType } from "@/lib/services/trainingService";
import { TRAINING_PHASE_LABEL } from "@/lib/trainingLabels";
import { Field, inputClass, selectClass, textareaClass, btnPrimary } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";

const SHIFT_LABEL: Record<TrainingShiftType, Record<Language, string>> = {
  MORNING: { en: "Morning", es: "Mañana" },
  EVENING: { en: "Evening", es: "Tarde/Noche" },
  DOUBLE: { en: "Double", es: "Doble" },
};

// Same 5pm morning/evening split as the rest of the app's shift-window logic
// (taskService.ts's windowForHour) -- duplicated here rather than imported
// since that module is server-only and this is a client component.
function currentShiftGuess(): TrainingShiftType {
  return new Date().getHours() < 17 ? "MORNING" : "EVENING";
}

function todayLocalDateInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtLogDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" });
}

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
          <DateField value={date} onChange={setDate} lang={lang} className={`${inputClass} h-8 text-xs`} />
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

/** "Retrained" needs a date/shift too, same as the full editor -- a manager
 * very often logs a retrain after the fact (later in the day, or even the
 * next shift), not at the exact moment it happened. Defaults to right now,
 * but both are editable before saving rather than silently stamped. Also
 * takes its own note for this specific retrain -- kept in the item's
 * activity log alongside every other past retrain, not just overwritten
 * onto one shared field. */
function RetrainForm({
  traineeId,
  itemId,
  managers,
  lang,
  onDone,
}: {
  traineeId: string;
  itemId: string;
  managers: ManagerOption[];
  lang: Language;
  onDone: () => void;
}) {
  const [date, setDate] = useState(todayLocalDateInput());
  const [shift, setShift] = useState<TrainingShiftType>(currentShiftGuess());
  const [trainer, setTrainer] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label={lang === "es" ? "Fecha" : "Date"}>
          <DateField value={date} onChange={setDate} lang={lang} className={`${inputClass} h-8 text-xs`} />
        </Field>
        <Field label={lang === "es" ? "Turno" : "Shift"}>
          <select value={shift} onChange={(e) => setShift(e.target.value as TrainingShiftType)} className={`${selectClass} h-8 text-xs`}>
            {(Object.keys(SHIFT_LABEL) as TrainingShiftType[]).map((s) => (
              <option key={s} value={s}>
                {SHIFT_LABEL[s][lang]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={lang === "es" ? "Recapacitado por" : "Retrained by"}>
        <select value={trainer} onChange={(e) => setTrainer(e.target.value)} className={`${selectClass} h-8 text-xs`}>
          <option value="">{lang === "es" ? "Yo (quien lo registra)" : "Me (whoever's logging this)"}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={lang === "es" ? "Notas sobre este recapacitado (opcional)" : "Notes on this retrain (optional)"}
        className={`${textareaClass} text-xs`}
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !date}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await retrainTrainingItemAction(traineeId, itemId, date, shift, trainer, notes);
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

/** One past completion/retrain event -- fully correctable after the fact
 * (wrong trainer picked in the moment, wrong date/shift, a typo in the
 * note) without that looking like the retrain itself happened again. */
function LogEntryRow({
  traineeId,
  entry,
  managers,
  lang,
}: {
  traineeId: string;
  entry: TrainingCompletionLogEntry;
  managers: ManagerOption[];
  lang: Language;
}) {
  const [editing, setEditing] = useState(false);
  const d = new Date(entry.trained_at);
  const [date, setDate] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  const [shift, setShift] = useState<TrainingShiftType | "">(entry.shift_type || "");
  const [trainer, setTrainer] = useState(entry.trained_by || "");
  const [draft, setDraft] = useState(entry.notes || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="rounded-lg border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          {fmtLogDate(entry.trained_at, lang)}
          {entry.shift_type ? ` · ${SHIFT_LABEL[entry.shift_type][lang]}` : ""} · {entry.trained_by_name || "—"}
        </p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-accent">
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <DateField value={date} onChange={setDate} lang={lang} className={`${inputClass} h-8 text-xs`} />
            <select value={shift} onChange={(e) => setShift(e.target.value as TrainingShiftType)} className={`${selectClass} h-8 text-xs`}>
              <option value="">{lang === "es" ? "Sin especificar" : "Unspecified"}</option>
              {(Object.keys(SHIFT_LABEL) as TrainingShiftType[]).map((s) => (
                <option key={s} value={s}>
                  {SHIFT_LABEL[s][lang]}
                </option>
              ))}
            </select>
          </div>
          <select value={trainer} onChange={(e) => setTrainer(e.target.value)} className={`${selectClass} h-8 text-xs`}>
            <option value="">{lang === "es" ? "Sin especificar" : "Unspecified"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className={`${textareaClass} text-xs`} />
          {error && <p className="text-xs text-critical">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending || !date}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await updateTrainingLogEntryAction(traineeId, entry.id, date, shift, trainer, draft);
                  if (result && "error" in result && result.error) {
                    setError(result.error);
                    return;
                  }
                  setEditing(false);
                  router.refresh();
                });
              }}
              className="h-7 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {lang === "es" ? "Guardar" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-xs font-medium text-muted">
              {lang === "es" ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 text-xs italic text-muted">{entry.notes || (lang === "es" ? "Sin notas." : "No notes.")}</p>
      )}
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
  // Which item's title was tapped to reveal its full details/notes/activity --
  // separate from the checkbox, which only ever toggles trained/untrained.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
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

  const byPhase = new Map<TrainingItemPhase, TrainingChecklistRow[]>();
  for (const it of items) {
    if (!byPhase.has(it.phase)) byPhase.set(it.phase, []);
    byPhase.get(it.phase)!.push(it);
  }
  // Items already arrive pre-ordered (OPENING, SHIFT, CLOSING) from
  // getTraineeChecklist -- iterate the groups in that same encounter order
  // rather than a fixed phase list, so a position with only SHIFT steps
  // doesn't render two empty phase headers.
  const phaseGroups = [...byPhase.entries()];

  function renderItem(it: TrainingChecklistRow) {
    const trained = optimisticTrained[it.id] ?? !!it.trained_at;
    const label = lang === "es" && it.title_es ? it.title_es : it.title;
    const expanded = expandedFor === it.id;
    return (
      <div key={it.id} className="flex flex-col gap-1.5 px-3 py-3">
        {/* Only the checkbox itself toggles trained/untrained -- the
            title used to be part of the same giant tap target, so
            tapping it to read more silently flipped the checkbox
            instead. Now the title is its own tap target that expands
            full details/notes/activity, without touching trained state. */}
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
          <button type="button" onClick={() => setExpandedFor(expanded ? null : it.id)} className="min-w-0 flex-1 text-left">
            <p className="text-sm">{label}</p>
            {trained && it.trained_at && (() => {
              // log is ordered most-recent-first: index 0 is this current
              // completion, index 1 (if present) is what it replaced --
              // more than one entry means this was retrained, not just
              // trained once, and that's worth saying plainly instead of
              // burying it behind the same "Trained by" wording either way.
              const isRetrain = it.log.length > 1;
              const previous = it.log[1];
              return (
                <>
                  <p className="text-xs text-muted">
                    {isRetrain ? (lang === "es" ? "Recapacitado por" : "Retrained by") : lang === "es" ? "Capacitado por" : "Trained by"} {it.trained_by_name || "—"} ·{" "}
                    {new Date(it.trained_at!).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}
                    {it.shift_type ? ` · ${SHIFT_LABEL[it.shift_type][lang]}` : ""}
                  </p>
                  {isRetrain && previous && (
                    <p className="text-xs text-muted/80">
                      {lang === "es" ? "Antes: " : "Previously: "}
                      {previous.trained_by_name || "—"} ·{" "}
                      {new Date(previous.trained_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}
                      {previous.shift_type ? ` · ${SHIFT_LABEL[previous.shift_type][lang]}` : ""}
                    </p>
                  )}
                </>
              );
            })()}
          </button>
        </div>
        {expanded && (
          <div className="flex flex-col gap-2 pl-10">
            {it.notes && <p className="text-xs italic text-muted">{it.notes}</p>}
            {it.log.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-accent">
                  {lang === "es" ? `Actividad (${it.log.length})` : `Activity (${it.log.length})`}
                </p>
                {it.log.map((entry) => (
                  <LogEntryRow key={entry.id} traineeId={traineeId} entry={entry} managers={managers} lang={lang} />
                ))}
              </div>
            )}
            {!it.notes && it.log.length === 0 && <p className="text-xs text-muted">{lang === "es" ? "Sin notas." : "No notes."}</p>}
          </div>
        )}
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
          ) : retrainingFor === it.id ? (
            <div className="pl-10">
              <RetrainForm traineeId={traineeId} itemId={it.id} managers={managers} lang={lang} onDone={() => setRetrainingFor(null)} />
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3 pl-10">
              <button type="button" disabled={pending} onClick={() => setRetrainingFor(it.id)} className="shrink-0 text-xs font-semibold text-accent disabled:opacity-60">
                ↻ {lang === "es" ? "Recapacitado" : "Retrained"}
              </button>
              <button type="button" onClick={() => setEditingFor(it.id)} className="shrink-0 text-xs font-semibold text-accent">
                ✎ {lang === "es" ? "Editar" : "Edit"}
              </button>
            </div>
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {phaseGroups.map(([phase, phaseItems]) => {
        if (phaseGroups.length === 1) {
          return (
            <div key={phase} className="card divide-y divide-border">
              {phaseItems.map(renderItem)}
            </div>
          );
        }
        const trainedCount = phaseItems.filter((it) => optimisticTrained[it.id] ?? !!it.trained_at).length;
        const allDone = trainedCount === phaseItems.length;
        return (
          // Starts open unless every step in it is already checked off --
          // nothing left to do there shouldn't take up screen space, but a
          // group still in progress should be visible without an extra tap
          // (this is the page someone's actively working through a shift).
          <details key={phase} className="card overflow-hidden" open={!allDone}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-accent">{TRAINING_PHASE_LABEL[phase][lang]}</span>
              <span className="shrink-0 text-xs font-semibold text-accent">
                {trainedCount}/{phaseItems.length}
              </span>
            </summary>
            <div className="divide-y divide-border border-t border-border">{phaseItems.map(renderItem)}</div>
          </details>
        );
      })}
    </div>
  );
}
