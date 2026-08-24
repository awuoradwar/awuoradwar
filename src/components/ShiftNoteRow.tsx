"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShiftNoteAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";

// storeId intentionally isn't a prop here -- formatting created_at into a
// store-local time needs storeTime.ts, which pulls in the server-only db
// module (better-sqlite3's native binding) through a chain that can't be
// bundled for the browser. timeLabel is computed server-side by the caller
// and passed down as a plain string, same as TaskCard's dueLabel.
export default function ShiftNoteRow({
  note,
  lang,
  timeLabel,
}: {
  note: { id: string; text: string; author_name: string | null };
  lang: Language;
  timeLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
  const router = useRouter();

  if (optimisticallyDeleted) return null;

  return (
    <div className="card flex items-start justify-between gap-2 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-foreground">{note.text}</p>
        <p className="mt-0.5 text-xs text-muted">
          {note.author_name || (lang === "es" ? "Desconocido" : "Unknown")} · {timeLabel}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const msg = lang === "es" ? "¿Eliminar esta nota? Esto no se puede deshacer." : "Delete this note? This can't be undone.";
          if (!window.confirm(msg)) return;
          setOptimisticallyDeleted(true);
          startTransition(async () => {
            try {
              await deleteShiftNoteAction(note.id);
            } catch {
              setOptimisticallyDeleted(false);
            }
            router.refresh();
          });
        }}
        className="shrink-0 text-xs font-medium text-critical disabled:opacity-50"
      >
        {lang === "es" ? "Eliminar" : "Delete"}
      </button>
    </div>
  );
}
