"use client";

import { quickAddCleaningAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function CleaningForm({
  lang,
  areas,
}: {
  lang: Language;
  areas: Array<{ id: string; name: string }>;
}) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    null,
    quickAddCleaningAction,
    (fd) => `${lang === "es" ? "Limpieza" : "Cleaning"}: ${fd.get("title")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Área" : "Area"}>
        <select name="areaId" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            {lang === "es" ? "Selecciona un área" : "Select an area"}
          </option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={lang === "es" ? "Tarea" : "Task"}>
        <input name="title" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Frecuencia" : "Frequency"}>
        <select name="frequency" defaultValue="DAILY" className={selectClass}>
          <option value="DAILY">{lang === "es" ? "Diaria" : "Daily"}</option>
          <option value="WEEKLY">{lang === "es" ? "Semanal" : "Weekly"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Asociado (opcional)" : "Associate (optional)"}>
        <input name="associateName" className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="photoRequired" className="h-5 w-5" />
        {lang === "es" ? "Requiere foto" : "Photo required"}
      </label>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Agregar" : "Add"} />
    </form>
  );
}
