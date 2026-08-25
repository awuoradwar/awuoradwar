"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteShiftNoteAction } from "@/app/actions/operationsActions";
import { withFrom } from "@/lib/backHref";
import { Language } from "@/lib/types";
import type { NoteSection } from "@/lib/services/noteService";

// storeId intentionally isn't a prop here -- formatting created_at into a
// store-local time needs storeTime.ts, which pulls in the server-only db
// module (better-sqlite3's native binding) through a chain that can't be
// bundled for the browser. timeLabel is computed server-side by the caller
// and passed down as a plain string, same as TaskCard's dueLabel.
export default function ShiftNoteRow({
  note,
  lang,
  timeLabel,
  from,
}: {
  note: { id: string; title: string | null; title_es: string | null; text: string; sections: NoteSection[]; author_name: string | null };
  lang: Language;
  timeLabel: string;
  from?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
  const router = useRouter();

  if (optimisticallyDeleted) return null;

  const title = (lang === "es" && note.title_es) || note.title;
  const heading = title || (note.text.length > 60 ? `${note.text.slice(0, 60)}…` : note.text);
  // A one-line hint of the actual content below the heading -- the first
  // topic (a title already stands on its own without one), or the note's
  // plain text for a legacy pre-title note (where the heading above is
  // already that same text, so no redundant preview needed there).
  const firstTopic = lang === "es" ? note.sections[0]?.topicEs || note.sections[0]?.topic : note.sections[0]?.topic;
  const preview = title ? firstTopic || null : null;
  const href = `/note/${note.id}`;

  return (
    <div className="flex items-start justify-between gap-2 p-3 text-sm">
      <Link href={from ? withFrom(href, from) : href} className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{heading}</p>
        {preview && <p className="truncate text-xs text-muted">{preview}</p>}
        <p className="mt-0.5 text-xs text-muted">
          {note.author_name || (lang === "es" ? "Desconocido" : "Unknown")} · {timeLabel}
        </p>
      </Link>
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
