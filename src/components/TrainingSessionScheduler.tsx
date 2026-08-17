"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTrainingSessionAction, removeTrainingSessionAction } from "@/app/actions/trainingActions";
import { TrainingSessionRow, TrainingShiftType } from "@/lib/services/trainingService";
import { Language } from "@/lib/types";

const SHIFT_LABEL: Record<TrainingShiftType, Record<Language, string>> = {
  MORNING: { en: "Morning", es: "Mañana" },
  EVENING: { en: "Evening", es: "Tarde/Noche" },
  DOUBLE: { en: "Double", es: "Doble" },
};

interface ManagerOption {
  id: string;
  name: string;
}

export default function TrainingSessionScheduler({
  traineeId,
  sessions,
  managers,
  lang,
}: {
  traineeId: string;
  sessions: TrainingSessionRow[];
  managers: ManagerOption[];
  lang: Language;
}) {
  const [date, setDate] = useState("");
  const [shiftType, setShiftType] = useState<TrainingShiftType>("MORNING");
  const [managerId, setManagerId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-3">
      {sessions.length > 0 && (
        <div className="card divide-y divide-border">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {fmtDate(s.date)} · {SHIFT_LABEL[s.shift_type][lang]}
                </p>
                <p className="text-xs text-muted">{s.manager_name || (lang === "es" ? "Sin asignar" : "Unassigned")}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await removeTrainingSessionAction(s.id, traineeId); router.refresh(); })}
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
          if (!date) return;
          setError(null);
          startTransition(async () => {
            const result = await scheduleTrainingSessionAction(traineeId, date, shiftType, managerId);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setDate("");
            setManagerId("");
            router.refresh();
          });
        }}
        className="card flex flex-col gap-2 p-3"
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <select
            value={shiftType}
            onChange={(e) => setShiftType(e.target.value as TrainingShiftType)}
            className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          >
            {(Object.keys(SHIFT_LABEL) as TrainingShiftType[]).map((s) => (
              <option key={s} value={s}>
                {SHIFT_LABEL[s][lang]}
              </option>
            ))}
          </select>
        </div>
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        >
          <option value="">{lang === "es" ? "Gerente (opcional)" : "Manager (optional)"}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-critical">{error}</p>}
        <button
          disabled={pending || !date}
          className="tap-target rounded-xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
        >
          {lang === "es" ? "Programar sesión" : "Schedule session"}
        </button>
      </form>
    </div>
  );
}
