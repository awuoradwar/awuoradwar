import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getWeekTasks } from "@/lib/services/taskService";
import { weekStartOf } from "@/lib/services/recurrenceService";
import StatusBadge from "@/components/StatusBadge";
import WeekAddTaskForm from "@/components/WeekAddTaskForm";
import { POSITION_LABEL } from "@/lib/permissions";
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

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
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
              <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, m.load * 4)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {unassigned.length > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-warning">
            {unassigned.length} {user.language === "es" ? "elementos sin asignar esta semana" : "unassigned items this week"}
          </p>
        )}
      </section>

      <WeekAddTaskForm lang={user.language} managers={managers} days={days} />

      {Object.entries(byDay).map(([date, dayTasks]) => (
        <section key={date}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {dayNames[new Date(date + "T00:00:00Z").getDay()]} · {date.slice(5)}
          </h2>
          {dayTasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">
              {user.language === "es" ? "Nada programado" : "Nothing scheduled"}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {dayTasks.map((t) => (
                <div key={t.id} className="card flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{user.language === "es" && t.title_es ? t.title_es : t.title}</p>
                      <span
                        className={
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                          (t.source === "recurring"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-emerald-50 text-emerald-700")
                        }
                      >
                        {t.source === "recurring"
                          ? user.language === "es"
                            ? "Recurrente"
                            : "Recurring"
                          : user.language === "es"
                            ? "Agregada"
                            : "Added"}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{t.owner_name || (user.language === "es" ? "Sin asignar" : "Unassigned")}</p>
                  </div>
                  <StatusBadge status={t.status} lang={user.language} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
