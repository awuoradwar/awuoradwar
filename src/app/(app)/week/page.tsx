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
import { buildManagerColorMap } from "@/lib/managerColor";
import { storeToday } from "@/lib/storeTime";
import { getHolidaysInRange } from "@/lib/usHolidays";

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const EFFORT_WEIGHT: Record<string, number> = { QUICK: 1, STANDARD: 2, MAJOR: 4 };

export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const currentWeekStart = weekStartOf(storeToday(user.storeId));
  // Any date works here -- weekStartOf normalizes to that date's own Sunday --
  // so a bad/missing param just falls back to the current week rather than
  // erroring. Rows are stored per-date (manager_shifts, tasks.scheduled_date),
  // never overwritten week to week, so entering next week's schedule now and
  // simply navigating back here after Sunday is the entire "rollover" -- it's
  // already "this week" by then, and last week's data hasn't gone anywhere,
  // just a Prev tap away.
  const requestedWeekStart = typeof sp.weekStart === "string" ? sp.weekStart : undefined;
  const start = weekStartOf(requestedWeekStart || currentWeekStart);
  const isCurrentWeek = start === currentWeekStart;
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(startDate.getTime() + 6 * 86400000);
  const end = endDate.toISOString().slice(0, 10);
  const nextWeekStart = new Date(startDate.getTime() + 7 * 86400000).toISOString().slice(0, 10);

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
    label: `${dayNames[new Date(d + "T00:00:00Z").getUTCDay()]} ${d.slice(5)}`,
  }));

  const lastWeekStart = new Date(startDate.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const managerColors = buildManagerColorMap(managers.map((m) => m.id));

  // This week + next week -- posting/adjusting next week's schedule is
  // exactly what happens on this page, so a holiday landing just past the
  // currently-displayed week still needs to inform staffing decisions made
  // here today.
  const lookaheadEnd = new Date(startDate.getTime() + 13 * 86400000).toISOString().slice(0, 10);
  const upcomingHolidays = getHolidaysInRange(start, lookaheadEnd);

  const locale = user.language === "es" ? "es-MX" : "en-US";
  const weekRangeLabel = `${startDate.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/week?weekStart=${lastWeekStart}`}
          className="tap-target flex h-10 w-10 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full border border-border text-lg"
          aria-label={user.language === "es" ? "Semana anterior" : "Previous week"}
        >
          ‹
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold">{weekRangeLabel}</p>
          {!isCurrentWeek && (
            <Link href="/week" className="text-xs font-semibold text-accent underline">
              {user.language === "es" ? "Ir a esta semana" : "Jump to this week"}
            </Link>
          )}
        </div>
        <Link
          href={`/week?weekStart=${nextWeekStart}`}
          className="tap-target flex h-10 w-10 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full border border-border text-lg"
          aria-label={user.language === "es" ? "Semana siguiente" : "Next week"}
        >
          ›
        </Link>
      </div>

      {!isCurrentWeek && (
        <p className="-mt-4 text-center text-xs text-muted">
          {start > currentWeekStart
            ? user.language === "es"
              ? "Viendo una semana futura -- lo que agregues aquí se convertirá automáticamente en \"esta semana\" el domingo."
              : "Viewing a future week -- anything entered here becomes \"this week\" automatically once Sunday arrives."
            : user.language === "es"
              ? "Viendo el historial de una semana pasada."
              : "Viewing a past week's history."}
        </p>
      )}

      <Link
        href={`/more/weekly-summary?weekStart=${lastWeekStart}`}
        className="tap-target flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 text-sm font-semibold text-accent"
      >
        <span>📊 {user.language === "es" ? "Ver Resumen de la Semana Pasada" : "View Last Week's Summary"}</span>
        <span>→</span>
      </Link>

      {upcomingHolidays.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Próximos Días Festivos" : "Upcoming Holidays"}
          </h2>
          <div className="card divide-y divide-border">
            {upcomingHolidays.map((h) => (
              <div key={h.date} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{user.language === "es" ? h.name_es : h.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {dayNames[new Date(h.date + "T00:00:00Z").getUTCDay()]} · {h.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {user.language === "es"
              ? "Revisa las ventas de días festivos anteriores para planificar el personal según la demanda esperada."
              : "Check prior years' sales for these dates to plan staffing around expected demand."}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Carga por gerente" : "Manager capacity"}
        </h2>
        <div className="card divide-y divide-border">
          {loadByManager.map((m) => {
            const color = managerColors.get(m.id)!;
            return (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.dot }} />
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted">{POSITION_LABEL[m.position][user.language]}</p>
                  </div>
                </div>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full"
                    style={{ width: `${Math.min(100, m.load * 4)}%`, backgroundColor: color.dot }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {unassigned.length > 0 && (
          <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            {unassigned.length} {user.language === "es" ? "elementos sin asignar esta semana" : "unassigned items this week"}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {isCurrentWeek
            ? user.language === "es"
              ? "Quién trabaja esta semana"
              : "Who's Working This Week"
            : user.language === "es"
              ? `Quién trabaja · ${weekRangeLabel}`
              : `Who's Working · ${weekRangeLabel}`}
        </h2>
        <ShiftScheduleGrid managers={managers} days={days} schedule={managerSchedule} canEdit={canEditSchedule} lang={user.language} />
      </section>

      <WeekAddTaskForm lang={user.language} managers={managers} days={days} managerSchedule={managerSchedule} />

      {Object.entries(byDay).map(([date, dayTasks]) => (
        <details key={date} className="card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">
              {dayNames[new Date(date + "T00:00:00Z").getUTCDay()]} · {date.slice(5)}
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
                <WeekTaskRow key={t.id} task={t} managers={managers} lang={user.language} managerColors={Object.fromEntries(managerColors)} />
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
