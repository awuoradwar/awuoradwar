import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWorkOrdersGrouped, WorkOrderRow as WorkOrderRowData } from "@/lib/services/issueService";
import WorkOrderRow from "@/components/WorkOrderRow";
import PageHeader from "@/components/PageHeader";
import HistoryByWeek from "@/components/HistoryByWeek";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";
import { storeToday } from "@/lib/storeTime";

function weekSubtitle(items: WorkOrderRowData[], lang: Language) {
  const critical = items.filter((i) => i.severity === "CRITICAL").length;
  return critical ? (lang === "es" ? `${critical} crítico${critical === 1 ? "" : "s"}` : `${critical} critical`) : "";
}

function Section({
  title,
  sub,
  rows,
  lang,
  collapsible,
}: {
  title: string;
  sub?: string;
  rows: WorkOrderRowData[];
  lang: Language;
  collapsible?: boolean;
}) {
  const body =
    rows.length === 0 ? (
      <p
        className={
          collapsible
            ? "border-t border-border p-4 text-center text-xs text-muted"
            : "rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted"
        }
      >
        {t(lang, "all_clear")}
      </p>
    ) : (
      <div className={collapsible ? "divide-y divide-border border-t border-border" : "card divide-y divide-border"}>
        {rows.map((o) => (
          <WorkOrderRow key={o.id} order={o} lang={lang} />
        ))}
      </div>
    );

  if (collapsible) {
    return (
      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{title}</span>
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted">{rows.length}</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{title}</h2>
        {rows.length > 0 && <span className="text-xs font-semibold text-muted">{rows.length}</span>}
      </div>
      {sub && <p className="mb-2 text-xs text-muted">{sub}</p>}
      {body}
    </section>
  );
}

export default async function WorkOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const todayStr = storeToday(user.storeId);
  const weekEndStr = new Date(new Date(todayStr + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const groups = getWorkOrdersGrouped(user.storeId, todayStr, weekEndStr);
  const lang = user.language;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/more" lang={lang} title={t(lang, "work_orders_title")} />

      <Link
        href="/add/issue"
        className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar orden de trabajo" : "+ Add work order"}
      </Link>

      <Section title={t(lang, "work_orders_needs_followup")} sub={t(lang, "work_orders_needs_followup_sub")} rows={groups.needsFollowUp} lang={lang} />
      <Section title={t(lang, "work_orders_due_today")} sub={t(lang, "work_orders_due_today_sub")} rows={groups.dueToday} lang={lang} />
      <Section title={t(lang, "work_orders_due_this_week")} rows={groups.dueThisWeek} lang={lang} collapsible />
      <Section title={t(lang, "work_orders_no_date")} rows={groups.noDate} lang={lang} collapsible />

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{t(lang, "work_orders_done")}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{groups.done.length}</span>
        </summary>
        <HistoryByWeek
          items={groups.done}
          getDate={(item) => item.resolved_at || item.created_at}
          keyOf={(item) => item.id}
          storeId={user.storeId}
          renderItem={(item) => <WorkOrderRow order={item} lang={lang} />}
          renderSubtitle={(items) => weekSubtitle(items, lang)}
          lang={lang}
          emptyLabel={t(lang, "all_clear")}
        />
      </details>
    </div>
  );
}
