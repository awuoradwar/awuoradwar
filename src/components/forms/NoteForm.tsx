"use client";

import { quickAddNoteAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, textareaClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function NoteForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    null,
    quickAddNoteAction,
    () => (lang === "es" ? "Nota" : "Note")
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Nota" : "Note"}>
        <textarea name="text" required rows={4} className={textareaClass} placeholder={lang === "es" ? "Nota factual y breve" : "Keep it factual and brief"} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
