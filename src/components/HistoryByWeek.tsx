import { Language } from "@/lib/types";

function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getDay();
  const start = new Date(d.getTime() - day * 86400000);
  return start.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

function fmtWeekRange(weekStart: string, weekEnd: string, locale: string): string {
  const s = new Date(weekStart + "T12:00:00Z");
  const e = new Date(weekEnd + "T12:00:00Z");
  const sameMonth = s.getMonth() === e.getMonth();
  const startFmt = s.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const endFmt = e.toLocaleDateString(locale, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${startFmt} – ${endFmt}`;
}

export interface WeekGroup<T> {
  weekStart: string;
  weekEnd: string;
  items: T[];
}

/** Buckets items into Sun-Sat weeks (same week boundary as the Week page),
 * newest week first. Items with no usable date are dropped rather than
 * crashing a week label on them -- callers should already be filtering to
 * dated history rows, but this keeps a stray null from breaking the page. */
export function groupByWeek<T>(items: T[], getDate: (item: T) => string | null): WeekGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const raw = getDate(item);
    const d = (raw || "").slice(0, 10);
    if (!d) continue;
    const start = weekStartOf(d);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start)!.push(item);
  }
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, weekItems]) => ({ weekStart, weekEnd: addDaysStr(weekStart, 6), items: weekItems }));
}

/** Drop-in replacement for a flat "History" list -- same divide-y/border-t
 * shell every history section already used, but split into one collapsible
 * week per Sun-Sat range so a manager can scan "how many of X happened this
 * week vs last" instead of scrolling one long undifferentiated list. Only
 * the mechanics (grouping, collapse, week label) are shared; each row's own
 * component and any domain-specific per-week breakdown (e.g. "3 call-ins,
 * 1 late") are supplied by the caller via renderItem/renderSubtitle. */
export default function HistoryByWeek<T>({
  items,
  getDate,
  keyOf,
  renderItem,
  renderSubtitle,
  lang,
  emptyLabel,
  defaultOpenCount = 1,
}: {
  items: T[];
  getDate: (item: T) => string | null;
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  renderSubtitle?: (items: T[]) => React.ReactNode;
  lang: Language;
  emptyLabel: string;
  defaultOpenCount?: number;
}) {
  if (items.length === 0) {
    return <p className="border-t border-border p-4 text-center text-xs text-muted">{emptyLabel}</p>;
  }

  const locale = lang === "es" ? "es-MX" : "en-US";
  const weeks = groupByWeek(items, getDate);

  return (
    <div className="divide-y divide-border border-t border-border">
      {weeks.map((w, i) => (
        <details key={w.weekStart} open={i < defaultOpenCount}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-accent/10 px-3 py-2.5">
            <span className="text-sm font-bold uppercase tracking-wide text-accent">{fmtWeekRange(w.weekStart, w.weekEnd, locale)}</span>
            <span className="flex shrink-0 items-center gap-2">
              {renderSubtitle && <span className="text-xs text-muted">{renderSubtitle(w.items)}</span>}
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{w.items.length}</span>
            </span>
          </summary>
          <div className="divide-y divide-border">
            {w.items.map((item) => (
              <div key={keyOf(item)}>{renderItem(item)}</div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
