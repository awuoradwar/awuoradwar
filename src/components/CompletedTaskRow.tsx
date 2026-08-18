import { Language } from "@/lib/types";
import { formatStoreDateTime } from "@/lib/storeTime";

export interface CompletedTaskData {
  id: string;
  title: string;
  title_es: string | null;
  area: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
}

/** Read-only row for the completed-work record -- no action button, just
 * what got done, by whom, and when, so finishing something has a visible
 * payoff instead of vanishing off the dashboard. */
export default function CompletedTaskRow({ task, lang, storeId }: { task: CompletedTaskData; lang: Language; storeId: string }) {
  const title = lang === "es" && task.title_es ? task.title_es : task.title;
  const timeLabel = task.completed_at
    ? formatStoreDateTime(storeId, task.completed_at, lang === "es" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-xs font-bold text-ok">✓</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground/80">{title}</p>
        <p className="truncate text-xs text-muted">
          {task.completed_by_name && <span>{task.completed_by_name}</span>}
          {task.area && <span>{task.completed_by_name ? " · " : ""}{task.area}</span>}
        </p>
      </div>
      {timeLabel && <span className="shrink-0 text-xs tabular-nums text-muted">{timeLabel}</span>}
    </div>
  );
}
