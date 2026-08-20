"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTrainingItemAction, setTrainingItemNotesAction } from "@/app/actions/trainingActions";
import { TrainingChecklistRow } from "@/lib/services/trainingService";
import { inputClass, btnPrimary } from "./forms/FormShell";
import { Language } from "@/lib/types";

/** A trained item can still need a flag for follow-up/retraining without
 * un-checking it (un-checking would misrepresent that the training never
 * happened at all) -- so notes live separately from the trained checkbox,
 * attached to that item's completion record. */
function NoteEditor({ traineeId, itemId, notes, lang, onDone }: { traineeId: string; itemId: string; notes: string; lang: Language; onDone: () => void }) {
  const [draft, setDraft] = useState(notes);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={lang === "es" ? "Ej: necesita repaso en velocidad de caja" : "e.g. needs follow-up on register speed"}
        className={`${inputClass} h-8 text-xs`}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await setTrainingItemNotesAction(traineeId, itemId, draft);
            onDone();
            router.refresh();
          });
        }}
        className={`${btnPrimary} h-8 px-3 text-xs`}
      >
        {lang === "es" ? "Guardar" : "Save"}
      </button>
      <button type="button" onClick={onDone} disabled={pending} className="text-xs font-medium text-muted">
        {lang === "es" ? "Cancelar" : "Cancel"}
      </button>
    </div>
  );
}

export default function TrainingChecklist({
  traineeId,
  items,
  lang,
}: {
  traineeId: string;
  items: TrainingChecklistRow[];
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  // Keyed by item id -- overrides only the items actually tapped this page
  // load; every other item still reflects the server prop.
  const [optimisticTrained, setOptimisticTrained] = useState<Record<string, boolean>>({});
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const router = useRouter();

  function toggle(itemId: string, currentlyTrained: boolean) {
    setOptimisticTrained((prev) => ({ ...prev, [itemId]: !currentlyTrained }));
    startTransition(async () => {
      try {
        await toggleTrainingItemAction(traineeId, itemId);
      } catch {
        setOptimisticTrained((prev) => ({ ...prev, [itemId]: currentlyTrained }));
      }
      router.refresh();
    });
  }

  return (
    <div className="card divide-y divide-border">
      {items.map((it) => {
        const trained = optimisticTrained[it.id] ?? !!it.trained_at;
        const label = lang === "es" && it.title_es ? it.title_es : it.title;
        return (
          <div key={it.id} className="flex flex-col gap-1.5 px-3 py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(it.id, trained)}
              className="tap-target flex w-full items-start gap-3 text-left disabled:opacity-60"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                  trained ? "border-ok bg-ok text-background" : "border-border text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-sm">{label}</p>
                {trained && it.trained_at && (
                  <p className="text-xs text-muted">
                    {lang === "es" ? "Capacitado por" : "Trained by"} {it.trained_by_name || "—"} · {new Date(it.trained_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}
                  </p>
                )}
              </span>
            </button>
            {trained &&
              (editingNotesFor === it.id ? (
                <div className="pl-8">
                  <NoteEditor traineeId={traineeId} itemId={it.id} notes={it.notes || ""} lang={lang} onDone={() => setEditingNotesFor(null)} />
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-8">
                  {it.notes ? (
                    <p className="min-w-0 flex-1 truncate text-xs italic text-muted">{it.notes}</p>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingNotesFor(it.id)}
                    className="shrink-0 text-xs font-semibold text-accent"
                  >
                    {it.notes ? `✎ ${lang === "es" ? "Editar nota" : "Edit note"}` : `+ ${lang === "es" ? "Nota" : "Note"}`}
                  </button>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
