import Link from "next/link";
import { Language } from "@/lib/types";
import { WorkOrderRow as WorkOrderRowData } from "@/lib/services/issueService";

const CATEGORY_ICON: Record<string, string> = {
  EQUIPMENT: "🔧",
  FACILITIES: "🏚️",
  OPERATIONAL: "📋",
  OTHER: "⚠️",
};

const CATEGORY_LABEL: Record<string, Record<Language, string>> = {
  EQUIPMENT: { en: "Equipment", es: "Equipo" },
  FACILITIES: { en: "Facilities", es: "Instalaciones" },
  OPERATIONAL: { en: "Operational", es: "Operativo" },
  OTHER: { en: "Other", es: "Otro" },
};

export default function WorkOrderRow({ order, lang }: { order: WorkOrderRowData; lang: Language }) {
  const dateLabel = order.due_date
    ? new Date(order.due_date + "T00:00:00").toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Link href={`/issue/${order.id}`} className="flex items-center gap-2 px-3 py-2">
      <span className="text-lg">{CATEGORY_ICON[order.category] || "⚠️"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{order.description}</p>
        <p className="truncate text-[11px] text-muted">
          {CATEGORY_LABEL[order.category]?.[lang] || order.category.replace(/_/g, " ")}
          {dateLabel && <span> · {dateLabel}</span>}
          {order.owner_name && <span> · {order.owner_name}</span>}
        </p>
      </div>
      {order.severity === "CRITICAL" && <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-critical">!</span>}
    </Link>
  );
}
