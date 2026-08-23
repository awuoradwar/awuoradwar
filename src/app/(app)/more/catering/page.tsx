import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import {
  getCateringDueOn,
  getUpcomingCateringOrders,
  getPastOpenCateringOrders,
  getCateringHistory,
} from "@/lib/services/cateringService";
import { storeToday } from "@/lib/storeTime";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";
import CateringOrderRow, { CateringOrderData } from "@/components/CateringOrderRow";
import PageHeader from "@/components/PageHeader";
import HistoryByWeek from "@/components/HistoryByWeek";

function weekSubtitle(items: CateringOrderData[], lang: Language) {
  const guests = items.reduce((sum, o) => sum + (o.number_of_people || 0), 0);
  if (!guests) return "";
  return lang === "es" ? `${guests} invitados` : `${guests} guests`;
}

function Section({ title, sub, rows, lang, collapsible }: { title: string; sub?: string; rows: CateringOrderData[]; lang: Language; collapsible?: boolean }) {
  const body =
    rows.length === 0 ? (
      <p className={collapsible ? "border-t border-border p-4 text-center text-xs text-muted" : "rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted"}>
        {t(lang, "all_clear")}
      </p>
    ) : (
      <div className={collapsible ? "flex flex-col gap-2 border-t border-border p-3" : "flex flex-col gap-2"}>
        {rows.map((o) => (
          <CateringOrderRow key={o.id} order={o} lang={lang} />
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

export default async function CateringPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const today = storeToday(user.storeId);
  const dueToday = getCateringDueOn(user.storeId, today);
  const upcoming = getUpcomingCateringOrders(user.storeId, today);
  const pastDue = getPastOpenCateringOrders(user.storeId, today);
  const history = getCateringHistory(user.storeId);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/add" lang={lang} title={t(lang, "catering_title")} />

      <Link href="/add/catering" className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent">
        {t(lang, "catering_add")}
      </Link>

      <Section title={t(lang, "catering_due_today")} sub={t(lang, "catering_due_today_sub")} rows={dueToday} lang={lang} />
      {pastDue.length > 0 && (
        <Section title={lang === "es" ? "Atrasados" : "Overdue"} sub={lang === "es" ? "Todavía abiertos, con fecha pasada" : "Still open, past their due date"} rows={pastDue} lang={lang} />
      )}
      <Section title={t(lang, "catering_upcoming")} rows={upcoming} lang={lang} collapsible />

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Historial" : "History"}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{history.length}</span>
        </summary>
        <HistoryByWeek
          items={history}
          getDate={(item) => item.due_date}
          keyOf={(item) => item.id}
          storeId={user.storeId}
          renderItem={(item) => <CateringOrderRow order={item} lang={lang} />}
          renderSubtitle={(items) => weekSubtitle(items, lang)}
          lang={lang}
          emptyLabel={t(lang, "all_clear")}
        />
      </details>
    </div>
  );
}
