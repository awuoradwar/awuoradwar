"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaskNoteAction } from "@/app/actions/taskActions";
import { textareaClass, btnOutline } from "./forms/FormShell";
import { Language } from "@/lib/types";

export interface TaskNoteData {
  id: string;
  note: string;
  created_by_name: string | null;
  /** Pre-formatted server-side (formatStoreDateTime is server-only) --
   * a client component can't format in the store's own timezone itself. */
  formattedAt: string;
}

/** A place to say why a task is still open (waiting on a part, covering
 * another shift, whatever) without touching the task's own title/description
 * -- those describe what the task IS, this is commentary added after the
 * fact, same "explains itself in its own words, appended not overwritten"
 * role AttendanceFollowups plays for a call-in. */
export default function TaskNotes({ taskId, notes, lang }: { taskId: string; notes: TaskNoteData[]; lang: Language }) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Notas" : "Notes"}</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`shrink-0 gap-1.5 ${btnOutline}`}>
            + {lang === "es" ? "Agregar nota" : "Add note"}
          </button>
        )}
      </div>

      {notes.length === 0 && !adding && <p className="mt-1 text-xs text-muted">{lang === "es" ? "Ninguna todavía." : "None yet."}</p>}

      {notes.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-border p-2.5">
              <p className="text-sm">{n.note}</p>
              <p className="mt-1 text-xs text-muted">
                {n.created_by_name || (lang === "es" ? "sistema" : "system")} · {n.formattedAt}
              </p>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await addTaskNoteAction(taskId, fd);
              if (result && "error" in result && result.error) {
                setError(result.error);
                return;
              }
              setError(null);
              setAdding(false);
              router.refresh();
            });
          }}
          className="mt-2 flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5"
        >
          <textarea
            name="note"
            rows={2}
            required
            autoFocus
            placeholder={lang === "es" ? "Ej: esperando una pieza, cubriendo otro turno" : "e.g. waiting on a part, covering another shift"}
            className={textareaClass}
          />
          {error && <p className="text-xs text-critical">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="h-8 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50">
              {pending ? "…" : lang === "es" ? "Guardar" : "Save"}
            </button>
            <button type="button" onClick={() => setAdding(false)} disabled={pending} className="text-xs font-medium text-muted">
              {lang === "es" ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
