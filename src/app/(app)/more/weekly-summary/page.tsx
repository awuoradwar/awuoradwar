import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWeekSummary } from "@/lib/services/weekSummaryService";
import { weekStartOf } from "@/lib/services/recurrenceService";
import PageHeader from "@/components/PageHeader";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}%`;
}

export default async function WeeklySummaryPage({ searchParams }: PageProps<"/more/weekly-summary">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const es = user.language === "es";
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const currentWeekStart = weekStartOf(today);
  const lastCompletedWeekStart = addDays(currentWeekStart, -7);
  const weekStart = (sp.weekStart as string) || lastCompletedWeekStart;
  const weekEnd = addDays(weekStart, 6);

  const summary = getWeekSummary(user.storeId, weekStart, weekEnd);
  const isCurrentWeek = weekStart === currentWeekStart;

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(es ? "es-MX" : "en-US", { month: "short", day: "numeric" });

  const stats = [
    { label: es ? "Tareas completadas" : "Tasks completed", value: summary.tasksCompleted, tone: "ok" as const },
    { label: es ? "Tareas aún abiertas" : "Tasks still open", value: summary.tasksStillOpen, tone: summary.tasksStillOpen > 0 ? "warning" as const : "ok" as const },
    { label: es ? "Limpiezas completadas" : "Cleaning completions", value: summary.cleaningCompletions, tone: "ok" as const },
    { label: es ? "Reemplazos de comida" : "Meal replacements handled", value: summary.mealReplacementsHandled, tone: "ok" as const },
    { label: es ? "Problemas resueltos" : "Issues resolved", value: `${summary.issuesResolved}/${summary.issuesOpened}`, tone: "ok" as const },
  ];

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={es ? "Resumen Semanal" : "Weekly Summary"} />

      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/more/weekly-summary?weekStart=${addDays(weekStart, -7)}`}
          className="tap-target rounded-full border border-border px-3 text-sm font-medium text-muted"
        >
          ← {es ? "Anterior" : "Prev"}
        </Link>
        <span className="text-sm font-semibold">
          {fmtDate(weekStart)} – {fmtDate(weekEnd)}
        </span>
        {isCurrentWeek ? (
          <span className="tap-target px-3 text-sm text-muted/50">{es ? "Siguiente" : "Next"} →</span>
        ) : (
          <Link
            href={`/more/weekly-summary?weekStart=${addDays(weekStart, 7)}`}
            className="tap-target rounded-full border border-border px-3 text-sm font-medium text-muted"
          >
            {es ? "Siguiente" : "Next"} →
          </Link>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Actividad operativa" : "Operational activity"}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="card p-3">
              <p className={`text-2xl font-bold ${s.tone === "warning" ? "text-warning" : "text-ok"}`}>{s.value}</p>
              <p className="text-xs text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Negocio (P&L / GEM)" : "Business (P&L / GEM)"}
        </h2>
        {!summary.period ? (
          <div className="card p-4 text-center text-sm text-muted">
            {es ? "No se registró ningún período de P&L esta semana." : "No P&L period was logged this week."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{summary.period.period_label}</p>
              <p className="text-xs text-muted">
                {es ? "Ventas netas" : "Net sales"}: {fmtMoney(summary.period.net_sales_actual)} · {es ? "Mano de obra" : "Labor"}: {fmtPct(summary.period.labor_pct)}
              </p>
            </div>
            {(summary.period.gem_taste_score !== null || summary.period.gem_accuracy_score !== null) && (
              <div className="grid grid-cols-2 gap-3 px-3 py-3">
                {summary.period.gem_taste_score !== null && (
                  <div>
                    <p className="text-lg font-bold">{summary.period.gem_taste_score.toFixed(1)}</p>
                    <p className="text-xs text-muted">{es ? "Sabor de Comida" : "Taste of Food"}</p>
                    {summary.period.gem_taste_goal !== null && (
                      <p className="text-xs text-muted">{es ? "Meta" : "Goal"} {summary.period.gem_taste_goal.toFixed(1)}</p>
                    )}
                  </div>
                )}
                {summary.period.gem_accuracy_score !== null && (
                  <div>
                    <p className="text-lg font-bold">{summary.period.gem_accuracy_score.toFixed(1)}</p>
                    <p className="text-xs text-muted">{es ? "Exactitud del Pedido" : "Accuracy of Order"}</p>
                    {summary.period.gem_accuracy_goal !== null && (
                      <p className="text-xs text-muted">{es ? "Meta" : "Goal"} {summary.period.gem_accuracy_goal.toFixed(1)}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <Link href="/more/store-profile" className="block px-3 py-2 text-xs font-medium text-accent">
              {es ? "Ver Perfil de Tienda →" : "View Store Profile →"}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
