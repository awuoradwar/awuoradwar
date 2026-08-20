"use client";

import { useState } from "react";
import { quickAddIssueAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, selectClass, inputClass, textareaClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function IssueForm({ lang }: { lang: Language }) {
  const [when, setWhen] = useState("");
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "issue",
    quickAddIssueAction,
    (fd) => `${lang === "es" ? "Problema" : "Issue"}: ${fd.get("category")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Categoría" : "Category"}>
        <select name="category" defaultValue="EQUIPMENT" className={selectClass}>
          <option value="EQUIPMENT">{lang === "es" ? "Equipo" : "Equipment"}</option>
          <option value="FACILITIES">{lang === "es" ? "Instalaciones" : "Facilities"}</option>
          <option value="OPERATIONAL">{lang === "es" ? "Operativo" : "Operational"}</option>
          <option value="OTHER">{lang === "es" ? "Otro" : "Other"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Descripción" : "Description"}>
        <textarea name="description" required rows={3} className={textareaClass} />
      </Field>
      <Field label={lang === "es" ? "Gravedad" : "Severity"}>
        <select name="severity" defaultValue="NORMAL" className={selectClass}>
          <option value="NORMAL">{lang === "es" ? "Normal" : "Normal"}</option>
          <option value="CRITICAL">{lang === "es" ? "Crítico" : "Critical"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "¿Para cuándo?" : "When does this need attention?"}>
        <select name="when" value={when} onChange={(e) => setWhen(e.target.value)} className={selectClass}>
          <option value="">{lang === "es" ? "Sin fecha específica" : "No specific date"}</option>
          <option value="TODAY">{lang === "es" ? "Hoy" : "Today"}</option>
          <option value="THIS_WEEK">{lang === "es" ? "Esta semana" : "This week"}</option>
          <option value="CUSTOM">{lang === "es" ? "Fecha específica..." : "Specific date..."}</option>
        </select>
      </Field>
      {when === "CUSTOM" && (
        <Field label={lang === "es" ? "Fecha" : "Date"}>
          <input name="customDate" type="date" required className={inputClass} />
        </Field>
      )}
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Reportar" : "Report"} />
    </form>
  );
}
