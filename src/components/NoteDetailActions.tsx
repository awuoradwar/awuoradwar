"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShiftNoteAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";

export default function NoteDetailActions({ id, lang, backHref }: { id: string; lang: Language; backHref: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const msg = lang === "es" ? "¿Eliminar esta nota? Esto no se puede deshacer." : "Delete this note? This can't be undone.";
        if (!window.confirm(msg)) return;
        startTransition(async () => {
          await deleteShiftNoteAction(id);
          router.push(backHref);
        });
      }}
      className="tap-target w-full rounded-xl border border-critical/30 text-sm font-medium text-critical disabled:opacity-50"
    >
      {pending ? "…" : lang === "es" ? "Eliminar nota" : "Delete note"}
    </button>
  );
}
