"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadWeeklyCleaningRotationAction } from "@/app/actions/cleaningActions";
import { Language } from "@/lib/types";

/** Re-sync button for when the company chart changes later -- only adds
 * items that aren't already there by title, so it's always safe to press
 * again without duplicating or touching anything already edited. */
export default function LoadRotationButton({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="mb-3 flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await loadWeeklyCleaningRotationAction();
            setMessage(
              lang === "es"
                ? result.added > 0
                  ? `Se agregaron ${result.added} tareas nuevas.`
                  : "Ya está todo al día."
                : result.added > 0
                  ? `Added ${result.added} new tasks.`
                  : "Already up to date."
            );
            router.refresh();
          })
        }
        className="text-xs font-semibold text-accent transition-opacity hover:opacity-75 disabled:opacity-50"
      >
        {pending ? "…" : lang === "es" ? "↻ Re-sincronizar rotación semanal" : "↻ Re-sync weekly rotation"}
      </button>
      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  );
}
