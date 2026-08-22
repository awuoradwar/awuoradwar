import { Language } from "@/lib/types";

interface DayGroup<T> {
  date: string;
  items: T[];
}

interface MonthGroup<T> {
  monthKey: string; // YYYY-MM
  days: DayGroup<T>[];
  count: number;
}

/** Buckets items by the month, then the day, of getDate(item) -- ascending
 * chronologically (oldest month first), since these are date-of-request
 * lists a manager reads forward through like a calendar, not a most-recent-
 * activity-first history feed. Items with no usable date are dropped. */
function groupByMonthThenDay<T>(items: T[], getDate: (item: T) => string | null): MonthGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const d = (getDate(item) || "").slice(0, 10);
    if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(item);
  }
  const byMonth = new Map<string, DayGroup<T>[]>();
  for (const [date, dayItems] of byDay) {
    const monthKey = date.slice(0, 7);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey)!.push({ date, items: dayItems });
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, days]) => ({
      monthKey,
      days: days.sort((a, b) => a.date.localeCompare(b.date)),
      count: days.reduce((sum, d) => sum + d.items.length, 0),
    }));
}

function monthLabel(monthKey: string, locale: string): string {
  const d = new Date(`${monthKey}-01T12:00:00Z`);
  return d.toLocaleDateString(locale, { year: "numeric", month: "long" });
}

function dayLabel(dateStr: string, locale: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

/** Drop-in replacement for a flat request list -- grouped by month, then by
 * day within the month, since requests get filed months ahead of the date
 * they're actually for. Only today's month (and any month after it) opens
 * by default; past months collapse so old history doesn't bury what's
 * actually coming up, without ever hiding it entirely. */
export default function RequestsByMonth<T>({
  items,
  getDate,
  keyOf,
  renderItem,
  lang,
  emptyLabel,
}: {
  items: T[];
  getDate: (item: T) => string | null;
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  lang: Language;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="p-4 text-center text-xs text-muted">{emptyLabel}</p>;
  }

  const locale = lang === "es" ? "es-MX" : "en-US";
  const months = groupByMonthThenDay(items, getDate);
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  return (
    <div className="divide-y divide-border">
      {months.map((m) => (
        <details key={m.monthKey} open={m.monthKey >= currentMonthKey}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-accent/10 px-3 py-2.5">
            <span className="text-sm font-bold uppercase tracking-wide text-accent">{monthLabel(m.monthKey, locale)}</span>
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{m.count}</span>
          </summary>
          <div className="divide-y divide-border">
            {m.days.map((d) => (
              <div key={d.date}>
                <p className="bg-card-subtle/50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{dayLabel(d.date, locale)}</p>
                <div className="divide-y divide-border">
                  {d.items.map((item) => (
                    <div key={keyOf(item)}>{renderItem(item)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
