"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTemplateScheduleAction } from "@/app/actions/templateActions";
import { Field, selectClass } from "./forms/FormShell";
import DueTimesField from "./forms/DueTimesField";
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

export interface RecurrenceConfig {
  weekdays?: number[];
  dueTimes?: string[];
  dueTime?: string; // legacy single-due-time shape, see dueTimes
  linkScheduleRequests?: boolean;
}

export default function TemplateScheduleEditor({
  id,
  recurrenceType,
  config,
  lang,
}: {
  id: string;
  recurrenceType: string;
  config: RecurrenceConfig;
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <details className="border-t border-border px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-accent">
        {lang === "es" ? "Editar horario" : "Edit schedule"}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await updateTemplateScheduleAction(id, fd);
            router.refresh();
          });
        }}
        className="mt-2 flex flex-col gap-2"
      >
        <Field label={lang === "es" ? "Recurrencia" : "Recurrence"}>
          <select name="recurrenceType" defaultValue={recurrenceType} className={selectClass}>
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
              <input type="checkbox" name="weekdays" value={d.v} defaultChecked={config.weekdays?.includes(d.v)} className="h-4 w-4" />
              {lang === "es" ? d.es : d.en}
            </label>
          ))}
        </div>
        <Field label={lang === "es" ? "Hora(s) límite" : "Due time(s)"}>
          <DueTimesField name="dueTime" lang={lang} defaultValues={config.dueTimes && config.dueTimes.length > 0 ? config.dueTimes : config.dueTime ? [config.dueTime] : undefined} />
        </Field>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" name="linkScheduleRequests" defaultChecked={!!config.linkScheduleRequests} className="mt-0.5 h-4 w-4" />
          <span>
            {lang === "es"
              ? "Mostrar las solicitudes de tiempo libre de la próxima semana en esta tarea"
              : "Show next week's time-off requests on this task"}
            <span className="block text-muted">
              {lang === "es"
                ? "Para una tarea como 'Crear y publicar el horario' -- muestra quién pidió libre para la semana que está programando."
                : "For a task like \"Create and post schedule\" -- shows who requested off for the week you're building."}
            </span>
          </span>
        </label>
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
