import { Language } from "@/lib/types";
import { ActivityItem } from "@/lib/services/activityService";
import { t } from "@/lib/i18n";
import { formatStoreDateTime } from "@/lib/storeTime";

const ENTITY_ICON: Record<string, string> = {
  task: "✅",
  cleaning_task: "🧹",
  guest_recovery: "🍽️",
  issue: "⚠️",
  borrowed_item: "📦",
  catering_order: "🍱",
};

const ACTION_LABEL: Record<string, Record<Language, string>> = {
  CREATED: { en: "logged", es: "registró" },
  EDITED: { en: "edited", es: "editó" },
  ASSIGNED: { en: "assigned", es: "asignó" },
  APPROVED: { en: "approved", es: "aprobó" },
  VERIFIED: { en: "verified", es: "verificó" },
  COMPLETED: { en: "completed", es: "completó" },
  REOPENED: { en: "reopened", es: "reabrió" },
  CANCELLED: { en: "cancelled", es: "canceló" },
  CARRIED_FORWARD: { en: "carried forward", es: "trasladó" },
  ACKNOWLEDGED: { en: "acknowledged", es: "confirmó" },
  DENIED: { en: "denied", es: "denegó" },
  SETTLED: { en: "settled", es: "saldó" },
};

export default function ActivityFeed({ items, lang, storeId }: { items: ActivityItem[]; lang: Language; storeId: string }) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">{t(lang, "all_clear")}</p>;
  }

  return (
    <div className="card divide-y divide-border">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm">
          <span className="mt-0.5 shrink-0">{ENTITY_ICON[item.entity_type] || "•"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate">
              <span className="font-medium">{item.actor_name || (lang === "es" ? "Sistema" : "System")}</span>{" "}
              <span className="text-muted">{ACTION_LABEL[item.action]?.[lang] || item.action.toLowerCase()}</span> {item.title}
            </p>
            <p className="text-xs text-muted">
              {formatStoreDateTime(storeId, item.created_at, lang === "es" ? "es-MX" : "en-US", {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
