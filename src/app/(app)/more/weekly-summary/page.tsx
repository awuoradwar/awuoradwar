import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWeekSummary, getWeekDetail, WeekItemRow } from "@/lib/services/weekSummaryService";
import { weekStartOf } from "@/lib/services/recurrenceService";
import PageHeader from "@/components/PageHeader";
import { storeToday, formatStoreDateTime } from "@/lib/storeTime";

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

  const today = storeToday(user.storeId);
  const currentWeekStart = weekStartOf(today);
  // Defaults to the week in progress -- live, updating as the week
  // happens -- not last week's already-closed numbers. Prev/Next still
  // reach any past week from here.
  const weekStart = (sp.weekStart as string) || currentWeekStart;
  const weekEnd = addDays(weekStart, 6);

  const summary = getWeekSummary(user.storeId, weekStart, weekEnd);
  const detail = getWeekDetail(user.storeId, weekStart, weekEnd, user.language);
  const isCurrentWeek = weekStart === currentWeekStart;

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(es ? "es-MX" : "en-US", { month: "short", day: "numeric" });
  const fmtWhen = (d: string) => (d ? formatStoreDateTime(user.storeId, d, es ? "es-MX" : "en-US", { weekday: "short", month: "short", day: "numeric" }) : "—");

  const tiles: Array<{ label: string; value: number; tone: "ok" | "warning"; items: WeekItemRow[]; href?: (id: string) => string }> = [
    { label: es ? "Tareas completadas" : "Tasks completed", value: summary.tasksCompleted, tone: "ok", items: detail.tasksCompleted, href: (id) => `/task/${id}` },
    {
      label: es ? "Tareas aún abiertas" : "Tasks still open",
      value: summary.tasksStillOpen,
      tone: summary.tasksStillOpen > 0 ? "warning" : "ok",
      items: detail.tasksStillOpen,
      href: (id) => `/task/${id}`,
    },
    { label: es ? "Limpiezas completadas" : "Cleaning completions", value: summary.cleaningCompletions, tone: "ok", items: detail.cleaningCompletions },
    {
      label: es ? "Reemplazos de comida" : "Meal replacements handled",
      value: summary.mealReplacementsHandled,
      tone: "ok",
      items: detail.mealReplacements,
      href: (id) => `/guest-recovery/${id}`,
    },
    {
      label: es ? "Problemas resueltos" : "Issues resolved",
      value: summary.issuesResolved,
      tone: "ok",
      items: detail.issuesResolved,
      href: (id) => `/issue/${id}`,
    },
  ];

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={es ? "Resumen Semanal" : "Weekly Summary"} />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href={`/more/weekly-summary?weekStart=${addDays(weekStart, -7)}`}
          replace
          className="tap-target flex shrink-0 items-center gap-1 rounded-full border border-accent px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span aria-hidden>←</span> {es ? "Anterior" : "Prev"}
        </Link>
        <span className="text-center text-sm font-semibold">
          {fmtDate(weekStart)} – {fmtDate(weekEnd)}
        </span>
        {isCurrentWeek ? (
          <span className="tap-target flex shrink-0 cursor-not-allowed items-center gap-1 rounded-full border border-border px-3 text-sm font-medium text-muted/50">
            {es ? "Siguiente" : "Next"} <span aria-hidden>→</span>
          </span>
        ) : (
          <Link
            href={`/more/weekly-summary?weekStart=${addDays(weekStart, 7)}`}
            replace
            className="tap-target flex shrink-0 items-center gap-1 rounded-full border border-accent px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {es ? "Siguiente" : "Next"} <span aria-hidden>→</span>
          </Link>
        )}
      </div>

      <section className="mb-6 flex flex-col gap-2">
        <h2 className="mb-0 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Actividad operativa" : "Operational activity"}
        </h2>
        {tiles.map((tile) => (
          <details key={tile.label} className="card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
              <span className="text-sm font-medium">{tile.label}</span>
              <span className={`shrink-0 text-lg font-bold ${tile.tone === "warning" ? "text-warning" : "text-ok"}`}>{tile.value}</span>
            </summary>
            {tile.items.length === 0 ? (
              <p className="border-t border-border p-3 text-center text-xs text-muted">
                {es ? "Nada aquí." : "Nothing here."}
              </p>
            ) : (
              <div className="divide-y divide-border border-t border-border">
                {tile.items.map((item) => {
                  const row = (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{item.title}</p>
                        <p className="truncate text-xs text-muted">
                          {fmtWhen(item.at)}
                          {item.subtitle && <span> · {item.subtitle}</span>}
                        </p>
                      </div>
                    </div>
                  );
                  return tile.href ? (
                    <Link key={item.id} href={tile.href(item.id)} className="block hover:bg-card-subtle">
                      {row}
                    </Link>
                  ) : (
                    <div key={item.id}>{row}</div>
                  );
                })}
              </div>
            )}
          </details>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Negocio (P&L)" : "Business (P&L)"}</h2>
        {!summary.period ? (
          <div className="card p-4 text-center text-sm text-muted">
            {es ? "Aún no se ha registrado ningún período de P&L." : "No P&L period has been logged yet."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{summary.period.period_label}</p>
                {summary.period.releasedThisWeek && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                    {es ? "PUBLICADO ESTA SEMANA" : "RELEASED THIS WEEK"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {es ? "Ventas netas" : "Net sales"}: {fmtMoney(summary.period.net_sales_actual)} · {es ? "Mano de obra" : "Labor"}: {fmtPct(summary.period.labor_pct)}
              </p>
            </div>
            <Link href="/more/store-profile" className="block px-3 py-2 text-xs font-medium text-accent">
              {es ? "Ver Perfil de Tienda (P&L y GEM) →" : "View Store Profile (P&L and GEM) →"}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
