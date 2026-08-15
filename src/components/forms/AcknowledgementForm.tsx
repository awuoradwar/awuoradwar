"use client";

import { quickAddAcknowledgementAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function AcknowledgementForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    null,
    quickAddAcknowledgementAction,
    (fd) => `${lang === "es" ? "Confirmación" : "Acknowledgement"}: ${fd.get("title")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input name="title" required className={inputClass} placeholder={lang === "es" ? "p.ej. Nueva política de seguridad" : "e.g. New safety policy"} />
      </Field>
      <Field label={lang === "es" ? "Asociados requeridos (separados por coma)" : "Required associates (comma separated)"}>
        <input name="associates" required className={inputClass} placeholder="Ana R., Luis M., Diego F." />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Crear" : "Create"} />
    </form>
  );
}
