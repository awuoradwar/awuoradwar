import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getHistoryForRange } from "@/lib/services/searchService";
import { getQualityMetrics, getCompletionStats } from "@/lib/services/reportsService";
import PageHeader from "@/components/PageHeader";
import FilterForm from "@/components/FilterForm";
import { t } from "@/lib/i18n";

export default async function ReportsPage({ searchParams }: PageProps<"/more/reports">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const db = getDb();

  const now = new Date();
  const defaultStart = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const start = (sp.start as string) || defaultStart;
  const end = (sp.end as string) || now.toISOString().slice(0, 10);

  const overdueTasks = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status IN ('OPEN','IN_PROGRESS') AND due_at IS NOT NULL AND due_at < ?`)
    .get(user.storeId, new Date().toISOString()) as { n: number };
  const carriedForward = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND status = 'CARRIED_FORWARD'`)
    .get(user.storeId) as { n: number };
  const unassigned = db
    .prepare(`SELECT COUNT(*) as n FROM tasks WHERE store_id = ? AND owner_id IS NULL AND status IN ('OPEN','IN_PROGRESS')`)
    .get(user.storeId) as { n: number };
  const openGR = db
    .prepare(`SELECT COUNT(*) as n FROM guest_recoveries WHERE store_id = ? AND replacement_status IN ('PENDING','APPROVED')`)
    .get(user.storeId) as { n: number };
  const openIssues = db
    .prepare(`SELECT COUNT(*) as n FROM issues WHERE store_id = ? AND status NOT IN ('RESOLVED')`)
    .get(user.storeId) as { n: number };
  const openBorrowed = db
    .prepare(`SELECT COUNT(*) as n FROM borrowed_items WHERE store_id = ? AND status != 'SETTLED'`)
    .get(user.storeId) as { n: number };

  const history = getHistoryForRange(user.storeId, start, end);
  const quality = getQualityMetrics(user.storeId, start, end);
  const todayStr = now.toISOString().slice(0, 10);
  const completion = getCompletionStats(user.storeId, user.id, todayStr, start, end);
  const es = user.language === "es";
  const fmtMinutes = (m: number | null) => (m == null ? "—" : m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`);
  const fmtDays = (d: number | null) => (d == null ? "—" : `${d.toFixed(1)}d`);

  const qualityMetrics = [
    { label: es ? "Tiempo mediano de captura rápida" : "Median quick-add time", value: fmtMinutes(quality.medianQuickAddMinutes) },
    { label: es ? "Tiempo de confirmación de entrega" : "Handoff ack. time", value: fmtMinutes(quality.medianHandoffAckMinutes) },
    { label: es ? "Críticas vencidas" : "Overdue critical", value: String(quality.overdueCritical) },
    { label: es ? "Antigüedad de traslados" : "Carry-forward age", value: fmtDays(quality.carryForwardAgeDays) },
    { label: es ? "Sin asignar (rango)" : "Unassigned (range)", value: String(quality.unassignedThisWeek) },
    { label: es ? "Gerentes/PIC activos" : "Active managers/PICs", value: String(quality.activePics) },
    { label: es ? "Reabiertos" : "Reopened", value: String(quality.reopenedCount) },
  ];

  const metrics = [
    { label: user.language === "es" ? "Vencidas ahora" : "Overdue right now", value: overdueTasks.n, tone: overdueTasks.n > 0 ? "critical" : "ok" },
    { label: user.language === "es" ? "Trasladadas" : "Carried forward", value: carriedForward.n, tone: "warning" },
    { label: user.language === "es" ? "Sin asignar esta semana" : "Unassigned this week", value: unassigned.n, tone: "warning" },
    { label: user.language === "es" ? "Recuperaciones abiertas" : "Open guest recoveries", value: openGR.n, tone: "warning" },
    { label: user.language === "es" ? "Problemas abiertos" : "Open issues", value: openIssues.n, tone: "warning" },
    { label: user.language === "es" ? "Préstamos abiertos" : "Open borrowed items", value: openBorrowed.n, tone: "warning" },
  ] as const;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Reportes" : "Reports"} />

      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="card p-3">
            <p className={`text-2xl font-bold ${m.tone === "critical" ? "text-critical" : m.tone === "warning" && m.value > 0 ? "text-warning" : "text-ok"}`}>
              {m.value}
            </p>
            <p className="text-xs text-muted">{m.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "reports_completion_title")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3">
            <p className="text-2xl font-bold text-ok">{completion.mine}</p>
            <p className="text-xs text-muted">{t(user.language, "reports_completion_mine")}</p>
          </div>
          <div className="card p-3">
            <p className="text-2xl font-bold text-ok">{completion.today}</p>
            <p className="text-xs text-muted">{t(user.language, "reports_completion_today")}</p>
          </div>
          <div className="card p-3">
            <p className="text-2xl font-bold text-ok">{completion.week}</p>
            <p className="text-xs text-muted">{t(user.language, "reports_completion_week")}</p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Calidad y adopción (rango seleccionado)" : "Quality & adoption (selected range)"}
        </h2>
        <div className="card divide-y divide-border text-sm">
          {qualityMetrics.map((m) => (
            <div key={m.label} className="flex items-center justify-between px-3 py-2">
              <span className="text-muted">{m.label}</span>
              <span className="font-semibold">{m.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Historial" : "History"}
        </h2>
        <FilterForm className="mb-3 flex gap-2">
          <input type="date" name="start" defaultValue={start} className="tap-target flex-1 rounded-xl border border-border bg-card px-2 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15" />
          <input type="date" name="end" defaultValue={end} className="tap-target flex-1 rounded-xl border border-border bg-card px-2 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15" />
          <button type="submit" className="tap-target rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85">
            {user.language === "es" ? "Ir" : "Go"}
          </button>
        </FilterForm>
        <div className="card divide-y divide-border text-sm">
          {(history.shifts as Array<{ id: string; date: string; pic_name: string | null }>).map((s) => (
            <Link key={s.id} href={`/history/${s.id}`} className="flex items-center justify-between px-3 py-2 text-accent">
              <span>{s.date}</span>
              <span className="text-xs text-muted">{s.pic_name || "—"} →</span>
            </Link>
          ))}
          {history.shifts.length === 0 && (
            <div className="px-3 py-2 text-muted">{user.language === "es" ? "Sin turnos en este rango." : "No shifts in this range."}</div>
          )}
          <div className="px-3 py-2">{history.tasks.length} {user.language === "es" ? "tareas" : "tasks"}</div>
          <div className="px-3 py-2">{history.guestRecoveries.length} {user.language === "es" ? "recuperaciones de clientes" : "guest recoveries"}</div>
          <div className="px-3 py-2">{history.issues.length} {user.language === "es" ? "problemas" : "issues"}</div>
          <div className="px-3 py-2">{history.borrowedItems.length} {user.language === "es" ? "artículos prestados" : "borrowed items"}</div>
          <div className="px-3 py-2">{history.handoffs.length} {user.language === "es" ? "entregas" : "handoffs"}</div>
        </div>
      </section>
    </div>
  );
}
