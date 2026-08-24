import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWasteEntries, getWasteTotals } from "@/lib/services/wasteService";
import { t } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import HistoryByWeek from "@/components/HistoryByWeek";
import WasteLogRow from "@/components/WasteLogRow";

export default async function WastePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const entries = getWasteEntries(user.storeId);
  const totals = getWasteTotals(user.storeId);

  const tiles = [
    { label: lang === "es" ? "Hoy" : "Today", value: totals.today },
    { label: lang === "es" ? "Esta semana" : "This week", value: totals.thisWeek },
    { label: lang === "es" ? "Este mes" : "This month", value: totals.thisMonth },
  ];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/add" lang={lang} title={t(lang, "waste_title")} />

      <Link href="/add/waste" className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent">
        {t(lang, "waste_add")}
      </Link>

      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-3 text-center">
            <p className="text-lg font-bold text-critical">${tile.value.toFixed(2)}</p>
            <p className="text-xs text-muted">{tile.label}</p>
          </div>
        ))}
      </div>

      <details className="card overflow-hidden" open>
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Historial" : "History"}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{entries.length}</span>
        </summary>
        <HistoryByWeek
          items={entries}
          getDate={(item) => item.wasted_date}
          keyOf={(item) => item.id}
          storeId={user.storeId}
          renderItem={(item) => <WasteLogRow entry={item} lang={lang} />}
          renderSubtitle={(items) => {
            const sum = items.reduce((s, i) => s + i.quantity * i.price_per_unit, 0);
            return `$${sum.toFixed(2)}`;
          }}
          lang={lang}
          emptyLabel={t(lang, "all_clear")}
        />
      </details>
    </div>
  );
}
