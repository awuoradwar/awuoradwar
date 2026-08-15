"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/app/actions/taskActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

interface ManagerOption {
  id: string;
  name: string;
}

interface DayOption {
  date: string;
  label: string;
}

export default function WeekAddTaskForm({
  lang,
  managers,
  days,
}: {
  lang: Language;
  managers: ManagerOption[];
  days: DayOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
          <select name="scheduledDate" defaultValue={days[0]?.date} className={selectClass}>
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={lang === "es" ? "Responsable" : "Owner"}>
          <select name="ownerId" defaultValue="" className={selectClass}>
            <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
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
          className="tap-target flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {pending ? "…" : lang === "es" ? "Agregar" : "Add"}
        </button>
      </div>
    </form>
  );
}
