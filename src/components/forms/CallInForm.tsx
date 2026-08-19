"use client";

import { quickAddCallInAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function CallInForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "callIn",
    quickAddCallInAction,
    (fd) => `${lang === "es" ? "Aviso de ausencia" : "Call-in"}: ${fd.get("employeeName")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Empleado" : "Employee"}>
        <input name="employeeName" required className={inputClass} placeholder={lang === "es" ? "Nombre" : "Name"} />
      </Field>
      <Field label={lang === "es" ? "Fecha" : "Date"}>
        <input name="eventDate" type="date" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Turno programado" : "Scheduled shift"}>
        <input name="scheduledTime" type="time" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Cobertura" : "Coverage"}>
        <select name="coverageStatus" defaultValue="NEEDED" className={selectClass}>
          <option value="NEEDED">{lang === "es" ? "Necesaria" : "Needed"}</option>
          <option value="FOUND">{lang === "es" ? "Encontrada" : "Found"}</option>
          <option value="NOT_FOUND">{lang === "es" ? "No Encontrada" : "Not Found"}</option>
          <option value="NOT_REQUIRED">{lang === "es" ? "No requerida" : "Not required"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Cubre" : "Covering person"}>
        <input name="coveringPerson" className={inputClass} placeholder={lang === "es" ? "Opcional" : "Optional"} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Registrar" : "Record"} />
    </form>
  );
}
