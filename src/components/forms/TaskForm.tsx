"use client";

import { quickAddTaskAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function TaskForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "task",
    quickAddTaskAction,
    (fd) => `${lang === "es" ? "Tarea" : "Task"}: ${fd.get("title")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input name="title" required className={inputClass} placeholder={lang === "es" ? "¿Qué hay que hacer?" : "What needs to happen?"} />
      </Field>
      <Field label={lang === "es" ? "Cuándo" : "When"}>
        <select name="scheduledFor" defaultValue="TODAY" className={selectClass}>
          <option value="TODAY">{lang === "es" ? "Hoy" : "Today"}</option>
          <option value="NEXT_SHIFT">{lang === "es" ? "Próximo turno" : "Next shift"}</option>
          <option value="TOMORROW">{lang === "es" ? "Mañana" : "Tomorrow"}</option>
          <option value="LATER_THIS_WEEK">{lang === "es" ? "Más tarde esta semana" : "Later this week"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Esfuerzo" : "Effort"}>
        <select name="effort" defaultValue="QUICK" className={selectClass}>
          <option value="QUICK">{lang === "es" ? "Rápido" : "Quick"}</option>
          <option value="STANDARD">{lang === "es" ? "Estándar" : "Standard"}</option>
          <option value="MAJOR">{lang === "es" ? "Mayor" : "Major"}</option>
        </select>
      </Field>
      <p className="text-xs text-muted">
        {lang === "es"
          ? "Se le asignará a usted y aparecerá en Mi Turno, Hoy o Esta Semana según cuándo lo programe."
          : "This gets assigned to you and will show up in My Shift, Today, or This Week depending on when you schedule it."}
      </p>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Agregar tarea" : "Add task"} />
    </form>
  );
}
