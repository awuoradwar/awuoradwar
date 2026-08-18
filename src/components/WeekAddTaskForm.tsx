"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/app/actions/taskActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language, Position } from "@/lib/types";

interface ManagerOption {
  id: string;
  name: string;
  position: Position;
}

interface DayOption {
  date: string;
  label: string;
}

interface ScheduleEntry {
  user_id: string;
  date: string;
  shift_type: string;
}

/** Same GM-outranks-everyone rule as PIC resolution: a scheduled GM is
 * always the suggested owner; otherwise the sole manager scheduled that
 * day; otherwise leave it for the person adding the task to decide (two or
 * more non-GM managers scheduled that day is genuinely ambiguous). */
function suggestOwnerForDate(date: string, managers: ManagerOption[], schedule: ScheduleEntry[]): string {
  const scheduledIds = new Set(schedule.filter((s) => s.date === date).map((s) => s.user_id));
  const candidates = managers.filter((m) => scheduledIds.has(m.id));
  if (candidates.length === 0) return "";
  const gm = candidates.find((m) => m.position === "GM");
  if (gm) return gm.id;
  return candidates.length === 1 ? candidates[0].id : "";
}

export default function WeekAddTaskForm({
  lang,
  managers,
  days,
  managerSchedule,
}: {
  lang: Language;
  managers: ManagerOption[];
  days: DayOption[];
  managerSchedule: ScheduleEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState(days[0]?.date ?? "");
  const [ownerId, setOwnerId] = useState(() => suggestOwnerForDate(days[0]?.date ?? "", managers, managerSchedule));
  const [ownerTouched, setOwnerTouched] = useState(false);
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target w-full rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar tarea a esta semana" : "+ Add a task to this week"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("scheduledFor", "DATE");
        setError(null);
        startTransition(async () => {
          const result = await createTaskAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <p className="text-xs text-muted">
        {lang === "es"
          ? "Para trabajo nuevo de esta semana — no se repetirá automáticamente. El trabajo recurrente ya está en el calendario cada semana."
          : "For new work specific to this week — it won't repeat on its own. Recurring work is already on the calendar every week."}
      </p>
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input name="title" required autoFocus className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "Día" : "Day"}>
          <select
            name="scheduledDate"
            value={scheduledDate}
            onChange={(e) => {
              setScheduledDate(e.target.value);
              if (!ownerTouched) setOwnerId(suggestOwnerForDate(e.target.value, managers, managerSchedule));
            }}
            className={selectClass}
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={lang === "es" ? "Responsable" : "Owner"}>
          <select
            name="ownerId"
            value={ownerId}
            onChange={(e) => {
              setOwnerId(e.target.value);
              setOwnerTouched(true);
            }}
            className={selectClass}
          >
            <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {!ownerTouched && ownerId && (
            <p className="mt-1 text-xs text-muted">
              {lang === "es" ? "Sugerido según quién está programado ese día" : "Suggested from who's scheduled that day"}
            </p>
          )}
        </Field>
      </div>
      <Field label={lang === "es" ? "Esfuerzo" : "Effort"}>
        <select name="effort" defaultValue="STANDARD" className={selectClass}>
          <option value="QUICK">{lang === "es" ? "Rápido" : "Quick"}</option>
          <option value="STANDARD">{lang === "es" ? "Estándar" : "Standard"}</option>
          <option value="MAJOR">{lang === "es" ? "Mayor" : "Major"}</option>
        </select>
      </Field>
      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap-target flex-1 rounded-xl border border-border text-sm font-semibold text-muted"
        >
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="tap-target flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "…" : lang === "es" ? "Agregar" : "Add"}
        </button>
      </div>
    </form>
  );
}
