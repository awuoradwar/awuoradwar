"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTrainingItemAction } from "@/app/actions/trainingActions";
import { TrainingChecklistRow } from "@/lib/services/trainingService";
import { Language } from "@/lib/types";

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
  const router = useRouter();

  function toggle(itemId: string) {
    startTransition(async () => {
      await toggleTrainingItemAction(traineeId, itemId);
      router.refresh();
    });
  }

  return (
    <div className="card divide-y divide-border">
      {items.map((it) => {
        const trained = !!it.trained_at;
        const label = lang === "es" && it.title_es ? it.title_es : it.title;
        return (
          <button
            key={it.id}
            type="button"
            disabled={pending}
            onClick={() => toggle(it.id)}
            className="tap-target flex w-full items-start gap-3 px-3 py-3 text-left disabled:opacity-60"
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
              {trained && (
                <p className="text-[11px] text-muted">
                  {lang === "es" ? "Capacitado por" : "Trained by"} {it.trained_by_name || "—"} · {new Date(it.trained_at!).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}
                </p>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
