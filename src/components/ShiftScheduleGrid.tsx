"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setManagerShiftAction, removeManagerShiftAction } from "@/app/actions/scheduleActions";
import { ShiftType } from "@/lib/services/scheduleService";
import { Language } from "@/lib/types";

const CYCLE: Array<ShiftType | null> = [null, "MORNING", "EVENING", "DOUBLE"];
const CODE: Record<string, string> = { MORNING: "M", EVENING: "E", DOUBLE: "D" };

interface DayOption {
  date: string;
  label: string;
}

interface ManagerOption {
  id: string;
  name: string;
}

interface ScheduleEntry {
  id: string;
  user_id: string;
  date: string;
  shift_type: ShiftType;
}

export default function ShiftScheduleGrid({
  managers,
  days,
  schedule,
  canEdit,
  lang,
}: {
  managers: ManagerOption[];
  days: DayOption[];
  schedule: ScheduleEntry[];
  canEdit: boolean;
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byManagerDate = new Map<string, ScheduleEntry>();
  for (const s of schedule) byManagerDate.set(`${s.user_id}|${s.date}`, s);

  function cycle(userId: string, date: string) {
    if (!canEdit || pending) return;
    const current = byManagerDate.get(`${userId}|${date}`);
    const currentIndex = CYCLE.indexOf(current?.shift_type ?? null);
    const next = CYCLE[(currentIndex + 1) % CYCLE.length];
    startTransition(async () => {
      if (next === null) {
        if (current) await removeManagerShiftAction(current.id);
      } else {
        await setManagerShiftAction(userId, date, next);
      }
      router.refresh();
    });
  }

  return (
    <div className="card divide-y divide-border">
      {managers.map((m) => (
        <div key={m.id} className="p-3">
          <p className="mb-2 text-sm font-medium">{m.name}</p>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const entry = byManagerDate.get(`${m.id}|${d.date}`);
              const code = entry ? CODE[entry.shift_type] : "—";
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={!canEdit || pending}
                  onClick={() => cycle(m.id, d.date)}
                  title={d.label}
                  className={`flex flex-col items-center rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
                    entry ? "bg-accent/10 text-accent" : "text-muted"
                  } ${canEdit ? "hover:bg-accent/15" : ""} disabled:cursor-default`}
                >
                  <span>{d.label.slice(0, 3)}</span>
                  <span className="text-xs font-bold">{code}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="px-3 py-2 text-[11px] text-muted">
        {lang === "es" ? "M = Mañana · E = Tarde/Noche · D = Doble" : "M = Morning · E = Evening · D = Double"}
        {canEdit ? (lang === "es" ? " · toca para cambiar" : " · tap to change") : ""}
      </p>
    </div>
  );
}
