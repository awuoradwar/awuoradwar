"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setManagerShiftAction, removeManagerShiftAction } from "@/app/actions/scheduleActions";
import { ShiftType } from "@/lib/services/scheduleService";
import { Language } from "@/lib/types";
import { buildManagerColorMap } from "@/lib/managerColor";

// Every option a manager's day could be, picked directly from a native
// select instead of a cycle a manager had to tap through repeatedly to
// reach whichever one they actually wanted (worst case 4 taps, and the two
// most common real values -- Evening and Double -- sat furthest around the
// cycle). A select is one extra tap for ANY target and opens the OS's own
// picker, already sized for a thumb, with no popover-positioning code
// needed for a 7-day grid. Kept to bare letters here so the closed cell
// stays compact -- the legend below spells out what each one covers.
const OPTIONS: Array<{ value: ShiftType | ""; label: string }> = [
  { value: "", label: "—" },
  { value: "MORNING", label: "M" },
  { value: "EVENING", label: "E" },
  { value: "DOUBLE", label: "D" },
];

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
  // planning a week means changing many cells in quick succession, each
  // pick needs to reconcile against the latest optimistic grid, and once
  // the real schedule lands via router.refresh() it must self-clear rather
  // than permanently hiding another manager's concurrent edit.
  const [optimisticSchedule, applyOptimisticChange] = useOptimistic(
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

  function pick(userId: string, date: string, next: ShiftType | "") {
    if (!canEdit || pending) return;
    const current = byManagerDate.get(`${userId}|${date}`);
    const nextValue = next === "" ? null : next;
    startTransition(async () => {
      applyOptimisticChange({ userId, date, next: nextValue });
      if (nextValue === null) {
        if (current) await removeManagerShiftAction(current.id);
      } else {
        await setManagerShiftAction(userId, date, nextValue);
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
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted">{d.label.slice(0, 3)}</span>
                    <select
                      aria-label={d.label}
                      disabled={!canEdit || pending}
                      value={entry?.shift_type ?? ""}
                      onChange={(e) => pick(m.id, d.date, e.target.value as ShiftType | "")}
                      style={entry ? { backgroundColor: color.bg, color: color.text } : undefined}
                      className={`h-8 w-full appearance-none rounded-lg text-center text-xs font-bold outline-none ${
                        entry ? "" : "bg-card-subtle text-muted"
                      } ${canEdit ? "cursor-pointer" : "cursor-default"} disabled:cursor-default`}
                    >
                      {OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="px-3 py-2 text-xs text-muted">
        {lang === "es"
          ? "M = Mañana (hasta 5pm) · E = Tarde/Noche (5pm en adelante) · D = Ambos (cubre todo el día -- incluye un turno que empieza a medio día y llega hasta el cierre)"
          : "M = Morning (through 5pm) · E = Evening (5pm on) · D = Both (covers the whole day -- this is what a midday-start-through-close shift counts as, whatever its exact start time)"}
        {canEdit ? (lang === "es" ? " · toca para elegir" : " · tap to pick") : ""}
      </p>
    </div>
  );
}
