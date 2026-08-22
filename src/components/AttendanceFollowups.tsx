"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAttendanceFollowupAction } from "@/app/actions/attendanceActions";
import { textareaClass, btnOutline } from "./forms/FormShell";
import { Language } from "@/lib/types";

export interface FollowupData {
  id: string;
  note: string;
  created_by_name: string | null;
  /** Pre-formatted server-side (formatStoreDateTime is server-only) --
   * a client component can't format in the store's own timezone itself. */
  formattedAt: string;
}

/** Later updates about an already-logged call-in/late, kept separate from
 * the entry's own Edit form -- Edit corrects the original record (wrong
 * time, typo'd name), this adds what's been learned since ("called back,
 * running 20 min late") without ever touching or replacing what was
 * originally written down. */
export default function AttendanceFollowups({
  eventId,
  followups,
  lang,
}: {
  eventId: string;
  followups: FollowupData[];
  lang: Language;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">
          {lang === "es" ? "Notas de seguimiento" : "Follow-up notes"}
        </h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`shrink-0 gap-1.5 ${btnOutline}`}>
            + {lang === "es" ? "Agregar nota" : "Add note"}
          </button>
        )}
      </div>

      {followups.length === 0 && !adding && (
        <p className="mt-1 text-xs text-muted">{lang === "es" ? "Ninguna todavía." : "None yet."}</p>
      )}

      {followups.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {followups.map((f) => (
            <div key={f.id} className="rounded-lg border border-border p-2.5">
              <p className="text-sm">{f.note}</p>
              <p className="mt-1 text-xs text-muted">
                {f.created_by_name || (lang === "es" ? "sistema" : "system")} · {f.formattedAt}
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
              const result = await addAttendanceFollowupAction(eventId, fd);
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
            placeholder={lang === "es" ? "Ej: llamó de vuelta, llega 20 min tarde" : "e.g. called back, running 20 min late"}
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
