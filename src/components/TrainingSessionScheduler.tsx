"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTrainingSessionAction, removeTrainingSessionAction, updateTrainingSessionAction } from "@/app/actions/trainingActions";
import { TrainingSessionRow, TrainingShiftType } from "@/lib/services/trainingService";
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

function fmtDate(d: string, lang: Language) {
  return new Date(d + "T00:00:00Z").toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** A scheduled session's date/shift/manager/notes are all provisional until
 * the shift actually happens -- editable in place instead of forcing a
 * remove-and-reschedule for something as small as swapping the manager. */
function EditSessionForm({
  session,
  traineeId,
  managers,
  lang,
  onDone,
}: {
  session: TrainingSessionRow;
  traineeId: string;
  managers: ManagerOption[];
  lang: Language;
  onDone: () => void;
}) {
  const [date, setDate] = useState(session.date);
  const [shiftType, setShiftType] = useState<TrainingShiftType>(session.shift_type);
  const [managerId, setManagerId] = useState(session.manager_id || "");
  const [notes, setNotes] = useState(session.notes || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={lang === "es" ? "Fecha" : "Date"}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Turno" : "Shift"}>
          <select value={shiftType} onChange={(e) => setShiftType(e.target.value as TrainingShiftType)} className={selectClass}>
            {(Object.keys(SHIFT_LABEL) as TrainingShiftType[]).map((s) => (
              <option key={s} value={s}>
                {SHIFT_LABEL[s][lang]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={lang === "es" ? "Gerente (opcional)" : "Manager (optional)"}>
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={selectClass}>
          <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </Field>
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !date}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await updateTrainingSessionAction(session.id, traineeId, date, shiftType, managerId, notes);
              if (result && "error" in result && result.error) {
                setError(result.error);
                return;
              }
              onDone();
              router.refresh();
            });
          }}
          className={btnPrimary}
        >
          {lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="text-sm font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function SessionRow({ session, traineeId, managers, lang }: { session: TrainingSessionRow; traineeId: string; managers: ManagerOption[]; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (editing) {
    return <EditSessionForm session={session} traineeId={traineeId} managers={managers} lang={lang} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">
          {fmtDate(session.date, lang)} · {SHIFT_LABEL[session.shift_type][lang]}
        </p>
        <p className="text-xs text-muted">{session.manager_name || (lang === "es" ? "Sin asignar" : "Unassigned")}</p>
        {session.notes && <p className="text-xs italic text-muted">{session.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="h-9 min-h-0 inline-flex shrink-0 items-center gap-1 rounded-full border border-accent px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          ✎ {lang === "es" ? "Editar" : "Edit"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await removeTrainingSessionAction(session.id, traineeId); router.refresh(); })}
          className="tap-target shrink-0 px-2 text-xs font-semibold text-critical disabled:opacity-50"
        >
          {lang === "es" ? "Quitar" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export default function TrainingSessionScheduler({
  traineeId,
  sessions,
  managers,
  lang,
}: {
  traineeId: string;
  sessions: TrainingSessionRow[];
  managers: ManagerOption[];
  lang: Language;
}) {
  const [date, setDate] = useState("");
  const [shiftType, setShiftType] = useState<TrainingShiftType>("MORNING");
  const [managerId, setManagerId] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {sessions.length > 0 && (
        <div className="card divide-y divide-border">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} traineeId={traineeId} managers={managers} lang={lang} />
          ))}
        </div>
      )}

      <details className="card overflow-hidden">
        <summary className="cursor-pointer list-none px-3 py-3 text-xs font-bold uppercase tracking-wide text-accent">
          {lang === "es" ? "+ Programar sesión" : "+ Schedule a session"}
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            setError(null);
            startTransition(async () => {
              const result = await scheduleTrainingSessionAction(traineeId, date, shiftType, managerId, notes);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setDate("");
              setManagerId("");
              setNotes("");
              router.refresh();
            });
          }}
          className="flex flex-col gap-2 border-t border-border p-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value as TrainingShiftType)}
              className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
            >
              {(Object.keys(SHIFT_LABEL) as TrainingShiftType[]).map((s) => (
                <option key={s} value={s}>
                  {SHIFT_LABEL[s][lang]}
                </option>
              ))}
            </select>
          </div>
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          >
            <option value="">{lang === "es" ? "Gerente (opcional)" : "Manager (optional)"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}
            className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          {error && <p className="text-xs text-critical">{error}</p>}
          <button
            disabled={pending || !date}
            className="tap-target rounded-xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
          >
            {lang === "es" ? "Programar sesión" : "Schedule session"}
          </button>
        </form>
      </details>
    </div>
  );
}
