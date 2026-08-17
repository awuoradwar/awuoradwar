"use client";

import { useState, useTransition } from "react";
import { checkConflictAction } from "@/app/actions/schedulingActions";
import { Field, inputClass } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

interface Conflict {
  type: string;
  severity: string;
  message: string;
}

export default function ConflictCheckTool({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<Conflict[] | null>(null);

  return (
    <div className="card flex flex-col gap-3 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const associateName = String(fd.get("associateName") || "").trim();
          const shiftDate = String(fd.get("shiftDate") || "");
          const startTime = String(fd.get("startTime") || "");
          const endTime = String(fd.get("endTime") || "");
          if (!associateName || !shiftDate) return;
          startTransition(async () => {
            const conflicts = await checkConflictAction(associateName, shiftDate, startTime, endTime);
            setResults(conflicts);
          });
        }}
        className="flex flex-col gap-3"
      >
        <Field label={lang === "es" ? "Asociado" : "Associate"}>
          <input name="associateName" required className={inputClass} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t(lang, "field_date")}>
            <input name="shiftDate" type="date" required className={inputClass} />
          </Field>
          <Field label={t(lang, "field_start_time")}>
            <input name="startTime" type="time" className={inputClass} />
          </Field>
          <Field label={t(lang, "field_end_time")}>
            <input name="endTime" type="time" className={inputClass} />
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="tap-target rounded-xl border-2 border-accent text-sm font-semibold text-accent disabled:opacity-50"
        >
          {pending ? "…" : t(lang, "scheduling_conflict_check_button")}
        </button>
      </form>

      {results !== null && (
        <div className="flex flex-col gap-2">
          {results.length === 0 ? (
            <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{t(lang, "scheduling_no_conflicts")}</p>
          ) : (
            results.map((c, i) => (
              <p
                key={i}
                className={
                  "rounded-lg px-3 py-2 text-sm " +
                  (c.severity === "BLOCKING" ? "bg-critical/10 text-critical" : "bg-warning/10 text-warning")
                }
              >
                <span className="font-bold">
                  {c.severity === "BLOCKING" ? "⛔ " + t(lang, "scheduling_conflict_blocking") : "⚠️ " + t(lang, "scheduling_conflict_warning")}:
                </span>{" "}
                {c.message}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}
