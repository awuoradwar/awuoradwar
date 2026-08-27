"use client";

import { useState } from "react";
import { Language } from "@/lib/types";
import { inputClass } from "./FormShell";

/** Repeatable list of "HH:MM" inputs, all sharing the same `name` -- the
 * server reads every one of them via formData.getAll(name). For a
 * recurring task checked more than once a day (a temp log at open/midday/
 * close, say), each due time generates its own separate, independently
 * completable instance -- see recurrenceService.ts's dueTimes handling. */
export default function DueTimesField({
  name,
  lang,
  defaultValues,
}: {
  name: string;
  lang: Language;
  defaultValues?: string[];
}) {
  const [times, setTimes] = useState<string[]>(defaultValues && defaultValues.length > 0 ? defaultValues : [""]);

  return (
    <div className="flex flex-col gap-2">
      {times.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            name={name}
            value={t}
            onChange={(e) => setTimes((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
            className={inputClass}
          />
          {times.length > 1 && (
            <button
              type="button"
              onClick={() => setTimes((prev) => prev.filter((_, idx) => idx !== i))}
              className="shrink-0 text-xs font-medium text-critical"
            >
              {lang === "es" ? "Quitar" : "Remove"}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setTimes((prev) => [...prev, ""])}
        className="self-start text-xs font-semibold text-accent"
      >
        + {lang === "es" ? "Agregar otra hora" : "Add another due time"}
      </button>
    </div>
  );
}
