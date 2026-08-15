"use client";

import { quickAddLateAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function LateForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "late",
    quickAddLateAction,
    (fd) => `${lang === "es" ? "Tardanza" : "Late"}: ${fd.get("employeeName")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Empleado" : "Employee"}>
        <input name="employeeName" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Hora programada" : "Scheduled time"}>
        <input name="scheduledTime" type="time" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Nota (opcional)" : "Note (optional)"}>
        <input name="note" className={inputClass} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Registrar" : "Record"} />
    </form>
  );
}
