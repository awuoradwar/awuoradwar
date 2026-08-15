"use client";

import { quickAddIssueAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, selectClass, textareaClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function IssueForm({ lang }: { lang: Language }) {
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
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Reportar" : "Report"} />
    </form>
  );
}
