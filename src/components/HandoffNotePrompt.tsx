"use client";

import { useState } from "react";
import { Language } from "@/lib/types";
import { inputClass } from "./forms/FormShell";

/** Shown in place of a plain Complete button when this task's template hands
 * a note forward (e.g. "how much change was ordered" -> shown in red on the
 * delivery task later in the week). The note is optional -- a manager can
 * still complete without one -- but it's asked for right here, at the moment
 * they actually know the answer, instead of hoping someone remembers Friday. */
export default function HandoffNotePrompt({
  targetTitle,
  lang,
  pending,
  onConfirm,
  onCancel,
}: {
  targetTitle: string;
  lang: Language;
  pending: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const es = lang === "es";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(note);
      }}
      onClick={(e) => e.stopPropagation()}
      className="mt-2 flex w-full flex-col gap-2 rounded-xl border border-critical/40 bg-critical/5 p-3"
    >
      <label className="text-xs font-semibold text-critical">
        {es ? "Nota para" : "Note for"} “{targetTitle}”
        <span className="block font-normal text-muted">{es ? "Ej.: cantidad pedida -- se mostrará en rojo en esa tarea." : "e.g. amount ordered -- shows in red on that task when it comes due."}</span>
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={es ? "$2,500" : "$2,500"}
        autoFocus
        inputMode="text"
        className={inputClass}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {pending ? "…" : `✓ ${es ? "Completar" : "Complete"}`}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="text-sm font-medium text-muted">
          {es ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
