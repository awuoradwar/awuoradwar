import Link from "next/link";
import { Language } from "@/lib/types";
import { BorrowedItemRow as BorrowedItemRowData } from "@/lib/services/borrowingService";
import { formatStoreDateTime } from "@/lib/storeTime";
import { translateUnit } from "@/lib/borrowedItemUnits";

export default function BorrowedItemRow({ item, lang, storeId }: { item: BorrowedItemRowData; lang: Language; storeId: string }) {
  const hoursUntilDue = item.due_at ? (new Date(item.due_at).getTime() - Date.now()) / 3600000 : null;
  const overdue = item.status !== "SETTLED" && hoursUntilDue !== null && hoursUntilDue < 0;
  const dueSoon = item.status !== "SETTLED" && hoursUntilDue !== null && hoursUntilDue >= 0 && hoursUntilDue <= 24;
  const dueLabel = item.due_at ? formatStoreDateTime(storeId, item.due_at, lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" }) : null;
  const unit = translateUnit(item.unit, lang);

  return (
    <Link href={`/borrowed-item/${item.id}`} className={`flex items-center gap-2 px-3 py-2 ${overdue || dueSoon ? "bg-critical/[0.04]" : ""}`}>
      <span className="text-lg">📦</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {item.direction === "LENT" ? (lang === "es" ? "Prestado a" : "Lent to") : lang === "es" ? "Prestado de" : "Borrowed from"} {item.borrowed_from}
        </p>
        <p className="truncate text-xs text-muted">
          {item.item}
          {item.quantity ? ` · ${item.quantity}${unit ? ` ${unit}` : ""}` : ""}
          {dueLabel && <span> · {lang === "es" ? "Vence" : "Due"} {dueLabel}</span>}
        </p>
      </div>
      {overdue && <span className="shrink-0 rounded bg-critical/10 px-1.5 py-0.5 text-xs font-semibold text-critical">{lang === "es" ? "Vencido" : "Overdue"}</span>}
      {!overdue && dueSoon && (
        <span className="shrink-0 rounded bg-critical/10 px-1.5 py-0.5 text-xs font-semibold text-critical">{lang === "es" ? "Vence pronto" : "Due Soon"}</span>
      )}
    </Link>
  );
}
