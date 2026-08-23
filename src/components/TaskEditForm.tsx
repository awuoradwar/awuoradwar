"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskAction } from "@/app/actions/taskActions";
import { Field, inputClass, selectClass, textareaClass } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function TaskEditForm({
  taskId,
  title,
  description,
  dueDateLocal,
  dueTimeLocal,
  effort,
  severity,
  lang,
}: {
  taskId: string;
  title: string;
  description: string | null;
  dueDateLocal: string | null;
  dueTimeLocal: string | null;
  effort: string;
  severity: string;
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details
      ref={detailsRef}
      className="mt-3"
      onToggle={() => {
        // Some mobile browsers reflow/scroll unpredictably when a <details>
        // low on the page opens (reported as "jumps to the top") -- take
        // over the scroll explicitly on open instead of leaving it to
        // whatever the platform does on its own.
        if (detailsRef.current?.open) {
          requestAnimationFrame(() => {
            const el = detailsRef.current;
            if (!el) return;
            const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
            const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
            window.scrollTo({ top, behavior: "smooth" });
          });
        }
      }}
    >
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-accent">
        {t(lang, "action_edit")}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await updateTaskAction(taskId, fd);
            if (detailsRef.current) detailsRef.current.open = false;
            router.refresh();
          });
        }}
        className="card mt-2 flex flex-col gap-3 p-3"
      >
        <Field label={t(lang, "field_title")}>
          <input name="title" defaultValue={title} required className={inputClass} />
        </Field>
        <Field label={t(lang, "field_description")}>
          <textarea name="description" defaultValue={description || ""} className={textareaClass} rows={3} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t(lang, "field_date")}>
            <DateField name="dueDate" defaultValue={dueDateLocal || ""} lang={lang} />
          </Field>
          <Field label={t(lang, "field_time")}>
            <input name="dueTime" type="time" defaultValue={dueTimeLocal || ""} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t(lang, "field_effort")}>
            <select name="effort" defaultValue={effort} className={selectClass}>
              <option value="QUICK">{t(lang, "effort_quick")}</option>
              <option value="STANDARD">{t(lang, "effort_standard")}</option>
              <option value="MAJOR">{t(lang, "effort_major")}</option>
            </select>
          </Field>
          <Field label={t(lang, "field_severity")}>
            <select name="severity" defaultValue={severity} className={selectClass}>
              <option value="NORMAL">{lang === "es" ? "Normal" : "Normal"}</option>
              <option value="CRITICAL">{lang === "es" ? "Crítica" : "Critical"}</option>
            </select>
          </Field>
        </div>
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
