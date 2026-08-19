import { getActivity } from "@/lib/audit";
import { formatStoreDateTime } from "@/lib/storeTime";
import { summarizeActivityChange } from "@/lib/activitySummary";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";

interface ActivityRow {
  id: string;
  action: string;
  actor_name: string | null;
  created_at: string;
  old_value: string | null;
  new_value: string | null;
}

/** The "View Activity" disclosure shared by every entity detail page --
 * who did what and when, plus a short summary of what was actually set,
 * built from whatever old_value/new_value the writing service captured. */
export default function ActivityLog({ entityType, entityId, storeId, lang }: { entityType: string; entityId: string; storeId: string; lang: Language }) {
  const activity = getActivity(entityType, entityId) as ActivityRow[];
  const locale = lang === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(storeId, iso, locale);

  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-accent">
        {t(lang, "action_view_activity")} ({activity.length})
      </summary>
      <div className="card mt-2 divide-y divide-border">
        {activity.length === 0 && <p className="px-3 py-2 text-xs text-muted">{t(lang, "detail_activity_none")}</p>}
        {activity.map((a) => {
          const summary = summarizeActivityChange(a.old_value, a.new_value, lang);
          return (
            <div key={a.id} className="px-3 py-2 text-xs">
              <p className="font-medium">
                {a.action} · {a.actor_name || "system"}
              </p>
              {summary && <p className="mt-0.5 text-foreground/80">{summary}</p>}
              <p className="mt-0.5 text-muted">{fmt(a.created_at)}</p>
            </div>
          );
        })}
      </div>
    </details>
  );
}
