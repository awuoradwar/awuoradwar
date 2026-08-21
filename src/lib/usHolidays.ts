export interface HolidayOccurrence {
  date: string; // YYYY-MM-DD
  name: string;
  name_es: string;
}

interface HolidayDef {
  name: string;
  name_es: string;
  /** Either a fixed month/day, or a "nth weekday of month" rule (weekday: 0=Sun..6=Sat). */
  rule: { month: number; day: number } | { month: number; weekday: number; nth: number } | { month: number; weekday: number; last: true };
}

// Standard US federal holidays -- the built-in calendar option. Not every
// company/store observes every one of these as a closure, but they're all
// dates that reliably shift foot traffic (up or down) worth a manager's
// attention when staffing the week around them.
const HOLIDAYS: HolidayDef[] = [
  { name: "New Year's Day", name_es: "Año Nuevo", rule: { month: 1, day: 1 } },
  { name: "Martin Luther King Jr. Day", name_es: "Día de Martin Luther King Jr.", rule: { month: 1, weekday: 1, nth: 3 } },
  { name: "Presidents Day", name_es: "Día de los Presidentes", rule: { month: 2, weekday: 1, nth: 3 } },
  { name: "Memorial Day", name_es: "Día de los Caídos", rule: { month: 5, weekday: 1, last: true } },
  { name: "Juneteenth", name_es: "Juneteenth", rule: { month: 6, day: 19 } },
  { name: "Independence Day", name_es: "Día de la Independencia", rule: { month: 7, day: 4 } },
  { name: "Labor Day", name_es: "Día del Trabajo", rule: { month: 9, weekday: 1, nth: 1 } },
  { name: "Columbus Day", name_es: "Día de la Raza", rule: { month: 10, weekday: 1, nth: 2 } },
  { name: "Veterans Day", name_es: "Día de los Veteranos", rule: { month: 11, day: 11 } },
  { name: "Thanksgiving", name_es: "Día de Acción de Gracias", rule: { month: 11, weekday: 4, nth: 4 } },
  { name: "Christmas Eve", name_es: "Nochebuena", rule: { month: 12, day: 24 } },
  { name: "Christmas Day", name_es: "Navidad", rule: { month: 12, day: 25 } },
  { name: "New Year's Eve", name_es: "Víspera de Año Nuevo", rule: { month: 12, day: 31 } },
];

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDayOfMonth));
  const lastWeekday = last.getUTCDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return new Date(Date.UTC(year, month - 1, lastDayOfMonth - offset)).toISOString().slice(0, 10);
}

function resolveDate(def: HolidayDef, year: number): string {
  const r = def.rule;
  if ("day" in r) return new Date(Date.UTC(year, r.month - 1, r.day)).toISOString().slice(0, 10);
  if ("last" in r) return lastWeekdayOfMonth(year, r.month, r.weekday);
  return nthWeekdayOfMonth(year, r.month, r.weekday, r.nth);
}

/** Every holiday landing within [startDate, endDate] (both YYYY-MM-DD,
 * inclusive), sorted chronologically -- spans a year boundary correctly
 * since it resolves each definition against every year touched by the
 * range, not just the range's start year. */
export function getHolidaysInRange(startDate: string, endDate: string): HolidayOccurrence[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const occurrences: HolidayOccurrence[] = [];
  for (let year = startYear; year <= endYear; year++) {
    for (const def of HOLIDAYS) {
      const date = resolveDate(def, year);
      if (date >= startDate && date <= endDate) {
        occurrences.push({ date, name: def.name, name_es: def.name_es });
      }
    }
  }
  return occurrences.sort((a, b) => (a.date < b.date ? -1 : 1));
}
