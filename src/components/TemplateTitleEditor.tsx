"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTemplateTitleAction } from "@/app/actions/templateActions";
import { Field, inputClass } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function TemplateTitleEditor({ id, title, titleEs, lang }: { id: string; title: string; titleEs: string | null; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <details className="border-t border-border px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-accent">
        {lang === "es" ? "Editar título" : "Edit title"}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await updateTemplateTitleAction(id, fd);
            router.refresh();
          });
        }}
        className="mt-2 flex flex-col gap-2"
      >
        <Field label={t(lang, "field_title")}>
          <input name="title" defaultValue={title} required className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Título en español (opcional)" : "Spanish title (optional)"}>
          <input name="titleEs" defaultValue={titleEs || ""} className={inputClass} />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "…" : t(lang, "action_save")}
        </button>
      </form>
    </details>
  );
}
