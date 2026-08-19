"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setManagerShiftAction, removeManagerShiftAction } from "@/app/actions/scheduleActions";
import { ShiftType } from "@/lib/services/scheduleService";
import { Language } from "@/lib/types";
import { buildManagerColorMap } from "@/lib/managerColor";

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

  // useOptimistic over the whole schedule array (not a flag per cell) --
  // planning a week means cycling many cells in quick succession, each tap
  // needs to reconcile against the latest optimistic grid, and once the
  // real schedule lands via router.refresh() it must self-clear rather
  // than permanently hiding another manager's concurrent edit.
  const [optimisticSchedule, applyOptimisticCycle] = useOptimistic(
    schedule,
    (state, change: { userId: string; date: string; next: ShiftType | null }) => {
      const key = `${change.userId}|${change.date}`;
      const filtered = state.filter((s) => `${s.user_id}|${s.date}` !== key);
      if (change.next === null) return filtered;
      return [...filtered, { id: `optimistic-${key}`, user_id: change.userId, date: change.date, shift_type: change.next }];
    }
  );

  const byManagerDate = new Map<string, ScheduleEntry>();
  for (const s of optimisticSchedule) byManagerDate.set(`${s.user_id}|${s.date}`, s);
  // Same id-sorted assignment as the Manager Capacity list above it, so a
  // given manager's dot color matches between the two sections.
  const managerColors = buildManagerColorMap(managers.map((m) => m.id));

  function cycle(userId: string, date: string) {
    if (!canEdit || pending) return;
    const current = byManagerDate.get(`${userId}|${date}`);
    const currentIndex = CYCLE.indexOf(current?.shift_type ?? null);
    const next = CYCLE[(currentIndex + 1) % CYCLE.length];
    startTransition(async () => {
      applyOptimisticCycle({ userId, date, next });
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
      {managers.map((m) => {
        const color = managerColors.get(m.id)!;
        return (
          <div key={m.id} className="p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.dot }} />
              {m.name}
            </p>
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
                    style={entry ? { backgroundColor: color.bg, color: color.text } : undefined}
                    className={`flex flex-col items-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                      entry ? "" : "text-muted"
                    } ${canEdit ? "hover:opacity-80" : ""} disabled:cursor-default`}
                  >
                    <span>{d.label.slice(0, 3)}</span>
                    <span className="text-xs font-bold">{code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="px-3 py-2 text-xs text-muted">
        {lang === "es" ? "M = Mañana · E = Tarde/Noche · D = Doble" : "M = Morning · E = Evening · D = Double"}
        {canEdit ? (lang === "es" ? " · toca para cambiar" : " · tap to change") : ""}
      </p>
    </div>
  );
}
