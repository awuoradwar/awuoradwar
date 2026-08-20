"use client";

import { quickAddLateAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, FileField, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";
import { NOTIFICATION_METHOD_LABEL } from "@/lib/attendanceLabels";

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
      <Field label={lang === "es" ? "Fecha" : "Date"}>
        <input name="eventDate" type="date" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Hora programada" : "Scheduled time"}>
        <input name="scheduledTime" type="time" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Hora en que avisó (opcional)" : "Time notified (optional)"}>
        <input name="notifiedAt" type="time" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Cómo avisó" : "How communicated"}>
        <select name="notificationMethod" defaultValue="" className={selectClass}>
          <option value="">{lang === "es" ? "Selecciona" : "Select"}</option>
          {Object.entries(NOTIFICATION_METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {lang === "es" ? label.es : label.en}
            </option>
          ))}
        </select>
      </Field>
      <Field label={lang === "es" ? "Captura de pantalla (opcional)" : "Screenshot (optional)"}>
        <FileField name="attachment" accept="image/*" lang={lang} />
      </Field>
      <Field label={lang === "es" ? "Nota (opcional)" : "Note (optional)"}>
        <input name="note" className={inputClass} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Registrar" : "Record"} />
    </form>
  );
}
