"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTemplateAction } from "@/app/actions/templateActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const WEEKDAYS = [
  { v: 0, en: "Sun", es: "Dom" },
  { v: 1, en: "Mon", es: "Lun" },
  { v: 2, en: "Tue", es: "Mar" },
  { v: 3, en: "Wed", es: "Mié" },
  { v: 4, en: "Thu", es: "Jue" },
  { v: 5, en: "Fri", es: "Vie" },
  { v: 6, en: "Sat", es: "Sáb" },
];

export default function TemplateForm({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await createTemplateAction(fd);
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input name="title" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Recurrencia" : "Recurrence"}>
        <select name="recurrenceType" defaultValue="WEEKLY" className={selectClass}>
          <option value="DAILY">{t(lang, "recurrence_daily")}</option>
          <option value="WEEKDAYS">{t(lang, "recurrence_weekdays")}</option>
          <option value="WEEKLY">{t(lang, "recurrence_weekly")}</option>
          <option value="BIWEEKLY">{t(lang, "recurrence_biweekly")}</option>
          <option value="MONTHLY">{t(lang, "recurrence_monthly")}</option>
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((d) => (
          <label key={d.v} className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="weekdays" value={d.v} className="h-4 w-4" />
            {lang === "es" ? d.es : d.en}
          </label>
        ))}
      </div>
      <Field label={lang === "es" ? "Hora límite" : "Due time"}>
        <input name="dueTime" type="time" className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Esfuerzo" : "Effort"}>
        <select name="effort" defaultValue="STANDARD" className={selectClass}>
          <option value="QUICK">{t(lang, "effort_quick")}</option>
          <option value="STANDARD">{t(lang, "effort_standard")}</option>
          <option value="MAJOR">{t(lang, "effort_major")}</option>
        </select>
      </Field>
      <button type="submit" disabled={pending} className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60">
        {pending ? "…" : lang === "es" ? "Crear plantilla" : "Create template"}
      </button>
    </form>
  );
}
