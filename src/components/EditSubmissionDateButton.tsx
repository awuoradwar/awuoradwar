"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSubmissionDateAction } from "@/app/actions/procedureActions";
import { Language } from "@/lib/types";
import DateField from "./forms/DateField";

/** A submission's date is fixed at submit time from the store's clock (or,
 * after midnight, the associate's own "which night did you close?" pick) --
 * this is the one place a manager can fix it after the fact, for anything
 * recorded before that picker existed or picked wrong anyway. Lives inside
 * an already-expanded ProcedureSubmissionRow, never inside its summary, so
 * it never fights the details/summary toggle for clicks. */
export default function EditSubmissionDateButton({ submissionId, currentDate, lang }: { submissionId: string; currentDate: string; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-accent">
        {es ? "Editar fecha" : "Edit date"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <DateField value={date} onChange={setDate} lang={lang} />
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateSubmissionDateAction(submissionId, date);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setEditing(false);
              router.refresh();
            })
          }
          className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-40"
        >
          {es ? "Guardar" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setDate(currentDate);
            setError(null);
          }}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted"
        >
          {es ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
