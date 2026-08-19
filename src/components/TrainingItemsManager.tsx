"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTrainingItemAction, removeTrainingItemAction } from "@/app/actions/trainingActions";
import { TrainingItem, TrainingPosition } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL, TRAINING_POSITIONS } from "@/lib/trainingLabels";
import { Language } from "@/lib/types";

function PositionList({
  position,
  label,
  items,
  lang,
}: {
  position: TrainingPosition;
  label: string;
  items: TrainingItem[];
  lang: Language;
}) {
  const [title, setTitle] = useState("");
  const [titleEs, setTitleEs] = useState("");
  const [pending, startTransition] = useTransition();
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const visibleItems = items.filter((it) => !removedIds.has(it.id));

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      {visibleItems.length > 0 && (
        <div className="mb-2 card divide-y divide-border">
          {visibleItems.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{it.title}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setRemovedIds((prev) => new Set(prev).add(it.id));
                  startTransition(async () => {
                    try {
                      await removeTrainingItemAction(it.id);
                    } catch {
                      setRemovedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(it.id);
                        return next;
                      });
                    }
                    router.refresh();
                  });
                }}
                className="tap-target shrink-0 px-2 text-xs font-semibold text-critical disabled:opacity-50"
              >
                {lang === "es" ? "Quitar" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          startTransition(async () => {
            await addTrainingItemAction(position, title, titleEs);
            setTitle("");
            setTitleEs("");
            router.refresh();
          });
        }}
        className="flex items-center gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={lang === "es" ? "Agregar paso de capacitación" : "Add training step"}
          className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <button
          disabled={pending || !title.trim()}
          className="tap-target shrink-0 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
        >
          {lang === "es" ? "Agregar" : "Add"}
        </button>
      </form>
    </div>
  );
}

export default function TrainingItemsManager({ itemsByPosition, lang }: { itemsByPosition: Record<TrainingPosition, TrainingItem[]>; lang: Language }) {
  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-semibold">
        {lang === "es" ? "Administrar lista de capacitación" : "Manage training checklist"}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">
        {TRAINING_POSITIONS.map((p) => (
          <PositionList key={p} position={p} label={TRAINING_POSITION_LABEL[p][lang]} items={itemsByPosition[p]} lang={lang} />
        ))}
      </div>
    </details>
  );
}
