import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getWeekTasks } from "@/lib/services/taskService";
import { weekStartOf } from "@/lib/services/recurrenceService";
import { getWeekManagerSchedule } from "@/lib/services/scheduleService";
import WeekAddTaskForm from "@/components/WeekAddTaskForm";
import WeekTaskRow from "@/components/WeekTaskRow";
import ShiftScheduleGrid from "@/components/ShiftScheduleGrid";
import { POSITION_LABEL, canDo } from "@/lib/permissions";
import { Position } from "@/lib/types";

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const EFFORT_WEIGHT: Record<string, number> = { QUICK: 1, STANDARD: 2, MAJOR: 4 };

export default async function WeekPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const start = weekStartOf(new Date().toISOString().slice(0, 10));
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(startDate.getTime() + 6 * 86400000);
  const end = endDate.toISOString().slice(0, 10);

  const tasks = getWeekTasks(user.storeId, start, end);
  const db = getDb();
  const managers = db
    .prepare(`SELECT id, name, position FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`)
    .all() as Array<{ id: string; name: string; position: Position }>;
  const managerSchedule = getWeekManagerSchedule(user.storeId, start, end);
  const canEditSchedule = canDo(user, "manager_shifts.manage");

  const byDay: Record<string, typeof tasks> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate.getTime() + i * 86400000).toISOString().slice(0, 10);
    byDay[d] = [];
  }
  const unassigned: typeof tasks = [];
  for (const task of tasks) {
    if (task.scheduled_date && byDay[task.scheduled_date]) byDay[task.scheduled_date].push(task);
    if (!task.owner_id) unassigned.push(task);
  }

  const loadByManager = managers.map((m) => {
    const load = tasks.filter((t) => t.owner_id === m.id).reduce((sum, t) => sum + (EFFORT_WEIGHT[t.effort] || 2), 0);
    return { ...m, load };
  });

  const dayNames = user.language === "es" ? DAY_NAMES_ES : DAY_NAMES_EN;

  const days = Object.keys(byDay).map((d) => ({
    date: d,
    label: `${dayNames[new Date(d + "T00:00:00Z").getDay()]} ${d.slice(5)}`,
  }));

  const lastWeekStart = new Date(startDate.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
      <Link
        href={`/more/weekly-summary?weekStart=${lastWeekStart}`}
        className="tap-target flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 text-sm font-semibold text-accent"
      >
        <span>📊 {user.language === "es" ? "Ver Resumen de la Semana Pasada" : "View Last Week's Summary"}</span>
        <span>→</span>
      </Link>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Carga por gerente" : "Manager capacity"}
        </h2>
        <div className="card divide-y divide-border">
          {loadByManager.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-muted">{POSITION_LABEL[m.position][user.language]}</p>
              </div>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, m.load * 4)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {unassigned.length > 0 && (
          <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            {unassigned.length} {user.language === "es" ? "elementos sin asignar esta semana" : "unassigned items this week"}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Quién trabaja esta semana" : "Who's Working This Week"}
        </h2>
        <ShiftScheduleGrid managers={managers} days={days} schedule={managerSchedule} canEdit={canEditSchedule} lang={user.language} />
      </section>

      <WeekAddTaskForm lang={user.language} managers={managers} days={days} />

      {Object.entries(byDay).map(([date, dayTasks]) => (
        <details key={date} className="card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">
              {dayNames[new Date(date + "T00:00:00Z").getDay()]} · {date.slice(5)}
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted">{dayTasks.length}</span>
          </summary>
          {dayTasks.length === 0 ? (
            <p className="border-t border-border p-4 text-center text-xs text-muted">
              {user.language === "es" ? "Nada programado" : "Nothing scheduled"}
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {dayTasks.map((t) => (
                <WeekTaskRow key={t.id} task={t} managers={managers} lang={user.language} />
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
