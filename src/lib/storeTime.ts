import "server-only";
import { getDb } from "./db";

// The server process runs in UTC. Stores run on their own local clock
// (stores.timezone, e.g. "America/Chicago"). Every date/time computation
// that means "what day/time is it right now for this store" has to convert
// through the store's actual IANA timezone -- comparing raw UTC against a
// naive HH:MM was silently wrong for hours every evening (UTC's calendar
// day flips before the store's local one does).

const tzCache = new Map<string, string>();

/** Call after changing stores.timezone so cached lookups don't serve a stale value. */
export function invalidateStoreTimezone(storeId: string): void {
  tzCache.delete(storeId);
}

export function getStoreTimezone(storeId: string): string {
  const cached = tzCache.get(storeId);
  if (cached) return cached;
  const db = getDb();
  const row = db.prepare(`SELECT timezone FROM stores WHERE id = ?`).get(storeId) as { timezone: string } | undefined;
  const tz = row?.timezone || "America/Chicago";
  tzCache.set(storeId, tz);
  return tz;
}

/** The calendar date (YYYY-MM-DD) it currently is in `tz`, not the server's UTC date. */
export function todayInTimezone(tz: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function storeToday(storeId: string, date: Date = new Date()): string {
  return todayInTimezone(getStoreTimezone(storeId), date);
}

/** The hour-of-day (0-23) it currently is in the store's own timezone, not the server's. */
export function storeLocalHour(storeId: string, date: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: getStoreTimezone(storeId), hour: "2-digit", hour12: false }).format(date);
  const hour = Number(formatted.replace(/\D/g, ""));
  return hour === 24 ? 0 : hour;
}

/** Convert a wall-clock date+time as observed in `tz` (e.g. "11:00 AM store-local")
 * into the real UTC instant it corresponds to, correctly accounting for DST. */
export function zonedWallTimeToUtc(tz: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  let h = get("hour");
  if (h === 24) h = 0;
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
  const offset = asIfUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Store-local "HH:MM" on a "YYYY-MM-DD" date -> real UTC ISO instant string. */
export function storeLocalIso(storeId: string, dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  return zonedWallTimeToUtc(getStoreTimezone(storeId), y, mo, d, h, mi).toISOString();
}

/**
 * The [start, end) UTC instant range for one store-local calendar day --
 * for "everything that happened today" queries against a UTC-stored
 * timestamp column. Comparing that column's string prefix against a bare
 * "YYYY-MM-DD" (`LIKE 'today%'`) silently misfiles anything within a few
 * hours of local midnight into the wrong day, since the UTC and store-local
 * calendar dates don't line up there -- a task finished at 11pm store-local
 * can carry a UTC timestamp already dated tomorrow, and vice versa near the
 * other edge. Use `completed_at >= start AND completed_at < end` instead.
 */
export function storeDayRangeUtc(storeId: string, dateStr: string): { start: string; end: string } {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const tz = getStoreTimezone(storeId);
  const start = zonedWallTimeToUtc(tz, y, mo, d, 0, 0);
  // Date.UTC normalizes an out-of-range day (e.g. d+1 past month end) into
  // the correct next month/year, so this is just "the calendar day after."
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const end = zonedWallTimeToUtc(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Format a UTC instant for display in the store's own timezone -- NOT the
 * server's. Server Components run Node's process clock (UTC on Railway),
 * so a bare `new Date(x).toLocaleString()` with no timeZone renders in
 * UTC regardless of what timezone the store or the person reading the
 * page is actually in -- a task due "10:00 AM" store-local silently shows
 * as "3:00 PM" to the manager looking at it. Client Components don't need
 * this (the browser's own local timezone is already correct there, since
 * whoever's holding the phone is standing in the store); this is only for
 * timestamps formatted server-side.
 */
export function formatStoreDateTime(storeId: string, isoUtc: string, locale: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(isoUtc).toLocaleString(locale, { ...options, timeZone: getStoreTimezone(storeId) });
}

/** Inverse of storeLocalIso -- a stored UTC instant back into the
 * "YYYY-MM-DDTHH:MM" shape an <input type="datetime-local"> expects,
 * showing the store's own wall-clock time rather than the server's UTC. */
export function utcToStoreLocalInput(storeId: string, isoUtc: string): string {
  const tz = getStoreTimezone(storeId);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoUtc));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}
