"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTraineeAction } from "@/app/actions/trainingActions";
import { TrainingPosition } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL, TRAINING_POSITIONS } from "@/lib/trainingLabels";
import { Language } from "@/lib/types";

export default function AddTraineeForm({ lang }: { lang: Language }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState<TrainingPosition>("COUNTERHELP");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setError(null);
        startTransition(async () => {
          const result = await createTraineeAction(name, position);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setName("");
          if (result?.id) router.push(`/more/training/${result.id}`);
          else router.refresh();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={lang === "es" ? "Nombre del nuevo asociado" : "New associate's name"}
        className="tap-target rounded-xl border border-border bg-card px-3.5 text-base outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      <select
        value={position}
        onChange={(e) => setPosition(e.target.value as TrainingPosition)}
        className="tap-target rounded-xl border border-border bg-card px-3.5 text-base outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
      >
        {TRAINING_POSITIONS.map((p) => (
          <option key={p} value={p}>
            {TRAINING_POSITION_LABEL[p][lang]}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-critical">{error}</p>}
      <button
        disabled={pending || !name.trim()}
        className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "…" : lang === "es" ? "Comenzar capacitación" : "Start training"}
      </button>
    </form>
  );
}
