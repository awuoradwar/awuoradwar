"use client";

import { useState } from "react";
import { quickAddTaskAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, SubmitBar } from "./FormShell";
import DateField from "./DateField";
import { Language } from "@/lib/types";

const WEEKDAYS: Array<{ value: number; en: string; es: string }> = [
  { value: 0, en: "Sun", es: "Dom" },
  { value: 1, en: "Mon", es: "Lun" },
  { value: 2, en: "Tue", es: "Mar" },
  { value: 3, en: "Wed", es: "Mié" },
  { value: 4, en: "Thu", es: "Jue" },
  { value: 5, en: "Fri", es: "Vie" },
  { value: 6, en: "Sat", es: "Sáb" },
];

export default function TaskForm({
  lang,
  isGM,
  managers,
  currentUserId,
}: {
  lang: Language;
  isGM: boolean;
  managers: Array<{ id: string; name: string }>;
  currentUserId: string;
}) {
  const [recurring, setRecurring] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("TODAY");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const allDaysSelected = selectedDays.length === WEEKDAYS.length;
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    recurring ? null : "task",
    quickAddTaskAction,
    (fd) => `${lang === "es" ? "Tarea" : "Task"}: ${fd.get("title")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input name="title" required className={inputClass} placeholder={lang === "es" ? "¿Qué hay que hacer?" : "What needs to happen?"} />
      </Field>

      <Field label={`${lang === "es" ? "Título en español" : "Spanish title"} (${lang === "es" ? "opcional" : "optional"})`}>
        <input name="titleEs" className={inputClass} placeholder={lang === "es" ? "Se muestra a quien vea la app en español" : "Shown to anyone viewing the app in Spanish"} />
      </Field>

      {isGM && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="recurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4" />
          {lang === "es" ? "Hacer esta tarea recurrente" : "Make this a recurring task"}
        </label>
      )}

      {recurring ? (
        <Field label={lang === "es" ? "Se repite los" : "Repeats on"}>
          <div className="flex flex-wrap items-center gap-2">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  name="weekdays"
                  value={d.value}
                  checked={selectedDays.includes(d.value)}
                  onChange={(e) =>
                    setSelectedDays((prev) => (e.target.checked ? [...prev, d.value] : prev.filter((v) => v !== d.value)))
                  }
                  className="h-3.5 w-3.5"
                />
                {lang === "es" ? d.es : d.en}
              </label>
            ))}
            <button
              type="button"
              onClick={() => setSelectedDays(allDaysSelected ? [] : WEEKDAYS.map((d) => d.value))}
              className="rounded-lg border border-accent px-2 py-1 text-xs font-semibold text-accent"
            >
              {allDaysSelected ? (lang === "es" ? "Ninguno" : "Clear") : lang === "es" ? "Todos los días" : "Every day"}
            </button>
          </div>
        </Field>
      ) : (
        <Field label={lang === "es" ? "Cuándo" : "When"}>
          <select name="scheduledFor" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={selectClass}>
            <option value="TODAY">{lang === "es" ? "Hoy" : "Today"}</option>
            <option value="NEXT_SHIFT">{lang === "es" ? "Próximo turno" : "Next shift"}</option>
            <option value="TOMORROW">{lang === "es" ? "Mañana" : "Tomorrow"}</option>
            <option value="LATER_THIS_WEEK">{lang === "es" ? "Más tarde esta semana" : "Later this week"}</option>
            <option value="CUSTOM">{lang === "es" ? "Fecha específica..." : "Specific date..."}</option>
          </select>
        </Field>
      )}

      {!recurring && scheduledFor === "CUSTOM" && (
        <Field label={lang === "es" ? "Fecha" : "Date"}>
          <DateField name="customDate" required lang={lang} />
        </Field>
      )}

      <Field label={lang === "es" ? "Hora de vencimiento (opcional)" : "Due time (optional)"}>
        <input type="time" name="dueTime" className={inputClass} />
      </Field>

      {!recurring && (
        <Field label={lang === "es" ? "Responsable" : "Owner"}>
          <select name="ownerId" defaultValue={currentUserId} className={selectClass}>
            <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? (lang === "es" ? "Yo" : "Me") : m.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {!recurring && (
        <Field label={`${lang === "es" ? "Apoyo" : "Support"} (${lang === "es" ? "opcional" : "optional"})`}>
          <select name="supportId" defaultValue="" className={selectClass}>
            <option value="">{lang === "es" ? "Nadie más" : "No one else"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? (lang === "es" ? "Yo" : "Me") : m.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label={lang === "es" ? "Esfuerzo" : "Effort"}>
        <select name="effort" defaultValue="QUICK" className={selectClass}>
          <option value="QUICK">{lang === "es" ? "Rápido" : "Quick"}</option>
          <option value="STANDARD">{lang === "es" ? "Estándar" : "Standard"}</option>
          <option value="MAJOR">{lang === "es" ? "Mayor" : "Major"}</option>
        </select>
      </Field>

      <p className="text-xs text-muted">
        {recurring
          ? lang === "es"
            ? "Se creará una plantilla recurrente -- las instancias se generarán automáticamente cada día que marcó."
            : "This creates a recurring template -- instances will be generated automatically on each day you checked."
          : lang === "es"
            ? "Aparecerá en Mi Turno, Hoy o Esta Semana según cuándo lo programe."
            : "This will show up in My Shift, Today, or This Week depending on when you schedule it."}
      </p>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Agregar tarea" : "Add task"} />
    </form>
  );
}
