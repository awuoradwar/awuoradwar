"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeSubmissionsAction } from "@/app/actions/procedureActions";
import { Language } from "@/lib/types";

/** Shown only when a day/shift cell has more than one submission for the
 * same station -- two associates whose separate kiosk visits didn't merge
 * on their own (see submitProcedure's own merge, and mergeSubmissions'
 * comment on why this can still happen). Folds every id after the first
 * into the first (earliest-submitted, passed in as submissionIds[0]). */
export default function MergeSubmissionsButton({ submissionIds, lang }: { submissionIds: string[]; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const es = lang === "es";

  function merge() {
    const confirmMsg = es
      ? "Combina estos envíos en uno solo -- los nombres y las casillas marcadas se combinan. No se puede deshacer. ¿Continuar?"
      : "Combines these into one submission -- names and checked items merge together. This can't be undone. Continue?";
    if (!confirm(confirmMsg)) return;
    setError(null);
    const [primaryId, ...otherIds] = submissionIds;
    startTransition(async () => {
      const result = await mergeSubmissionsAction(primaryId, otherIds);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={pending} onClick={merge} className="self-start text-xs font-semibold text-accent disabled:opacity-40">
        {pending ? "…" : es ? "Combinar en uno" : "Merge into one"}
      </button>
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
