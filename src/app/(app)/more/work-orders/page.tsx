import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWorkOrdersGrouped, WorkOrderRow as WorkOrderRowData } from "@/lib/services/issueService";
import WorkOrderRow from "@/components/WorkOrderRow";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";

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
            {sub && <p className="text-[11px] text-muted">{sub}</p>}
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
      {sub && <p className="mb-2 text-[11px] text-muted">{sub}</p>}
      {body}
    </section>
  );
}

export default async function WorkOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const weekEndStr = new Date(today.getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const groups = getWorkOrdersGrouped(user.storeId, todayStr, weekEndStr);
  const lang = user.language;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <div>
        <Link href="/more" className="mb-3 inline-block text-sm text-muted">
          ← {lang === "es" ? "Atrás" : "Back"}
        </Link>
        <h1 className="text-lg font-semibold">{t(lang, "work_orders_title")}</h1>
      </div>

      <Section title={t(lang, "work_orders_needs_followup")} sub={t(lang, "work_orders_needs_followup_sub")} rows={groups.needsFollowUp} lang={lang} />
      <Section title={t(lang, "work_orders_due_today")} sub={t(lang, "work_orders_due_today_sub")} rows={groups.dueToday} lang={lang} />
      <Section title={t(lang, "work_orders_due_this_week")} rows={groups.dueThisWeek} lang={lang} collapsible />
      <Section title={t(lang, "work_orders_no_date")} rows={groups.noDate} lang={lang} collapsible />
      <Section title={t(lang, "work_orders_done")} rows={groups.done} lang={lang} collapsible />
    </div>
  );
}
