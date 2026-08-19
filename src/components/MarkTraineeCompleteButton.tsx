"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markTraineeCompleteAction } from "@/app/actions/trainingActions";
import { Language } from "@/lib/types";

export default function MarkTraineeCompleteButton({ traineeId, disabled, lang }: { traineeId: string; disabled: boolean; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyComplete, setOptimisticallyComplete] = useState(false);
  const router = useRouter();

  if (optimisticallyComplete) {
    return (
      <button type="button" disabled className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground shadow-sm disabled:opacity-70">
        ✓
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={() => {
        setOptimisticallyComplete(true);
        startTransition(async () => {
          try {
            await markTraineeCompleteAction(traineeId);
          } catch {
            setOptimisticallyComplete(false);
          }
          router.refresh();
        });
      }}
      className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-40"
    >
      {disabled
        ? lang === "es" ? "Complete todos los pasos primero" : "Complete all steps first"
        : lang === "es" ? "Marcar Capacitación Completa" : "Mark Training Complete"}
    </button>
  );
}
