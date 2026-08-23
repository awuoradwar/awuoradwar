import { Language } from "@/lib/types";
import { weekStartOf } from "@/lib/services/recurrenceService";
import { storeToday } from "@/lib/storeTime";

/** getDate callbacks return two different shapes depending on the caller:
 * a plain "YYYY-MM-DD" (already the store-local calendar date something is
 * scheduled/due on -- use as-is) or a full UTC instant like `created_at`/
 * `trained_at` (needs converting through the store's own timezone before
 * taking its calendar date, the same trap storeTime.ts exists to avoid
 * elsewhere -- a 11pm store-local event can carry a UTC timestamp already
 * dated tomorrow, which silently bucketed it into the wrong week). */
function toStoreLocalDate(raw: string, storeId?: string): string {
  if (raw.length <= 10 || !storeId) return raw.slice(0, 10);
  return storeToday(storeId, new Date(raw));
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
export function groupByWeek<T>(items: T[], getDate: (item: T) => string | null, storeId?: string): WeekGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const raw = getDate(item);
    if (!raw) continue;
    const d = toStoreLocalDate(raw, storeId);
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
  storeId,
}: {
  items: T[];
  getDate: (item: T) => string | null;
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  renderSubtitle?: (items: T[]) => React.ReactNode;
  lang: Language;
  emptyLabel: string;
  /** Required whenever getDate returns a full timestamp (created_at,
   * trained_at, etc.) rather than an already-store-local "YYYY-MM-DD" --
   * without it, late-evening events get bucketed into the wrong week. */
  storeId?: string;
}) {
  if (items.length === 0) {
    return <p className="border-t border-border p-4 text-center text-xs text-muted">{emptyLabel}</p>;
  }

  const locale = lang === "es" ? "es-MX" : "en-US";
  const weeks = groupByWeek(items, getDate, storeId);

  return (
    <div className="divide-y divide-border border-t border-border">
      {weeks.map((w) => (
        <details key={w.weekStart}>
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
