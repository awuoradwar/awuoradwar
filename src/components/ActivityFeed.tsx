import { Language } from "@/lib/types";
import { ActivityItem } from "@/lib/services/activityService";
import { t } from "@/lib/i18n";
import { formatStoreDateTime, storeToday } from "@/lib/storeTime";

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

  const today = storeToday(storeId);
  const yesterday = storeToday(storeId, new Date(Date.now() - 24 * 60 * 60 * 1000));
  const locale = lang === "es" ? "es-MX" : "en-US";

  // Group by store-local calendar day so a long list reads as distinct,
  // collapsible days instead of one undifferentiated scroll -- only today
  // starts open, since that's what "since you were here" is mostly about.
  const groups: { dateKey: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const dateKey = storeToday(storeId, new Date(item.created_at));
    const last = groups[groups.length - 1];
    if (last && last.dateKey === dateKey) last.items.push(item);
    else groups.push({ dateKey, items: [item] });
  }

  const labelFor = (dateKey: string) => {
    if (dateKey === today) return lang === "es" ? "Hoy" : "Today";
    if (dateKey === yesterday) return lang === "es" ? "Ayer" : "Yesterday";
    return formatStoreDateTime(storeId, `${dateKey}T12:00:00.000Z`, locale, { weekday: "long", month: "long", day: "numeric" });
  };

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <details key={group.dateKey} className="card overflow-hidden" open={group.dateKey === today}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{labelFor(group.dateKey)}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">{group.items.length}</span>
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className="mt-0.5 shrink-0">{ENTITY_ICON[item.entity_type] || "•"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{item.actor_name || (lang === "es" ? "Sistema" : "System")}</span>{" "}
                    <span className="text-muted">{ACTION_LABEL[item.action]?.[lang] || item.action.toLowerCase()}</span> {item.title}
                  </p>
                  <p className="text-xs text-muted">
                    {formatStoreDateTime(storeId, item.created_at, locale, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
