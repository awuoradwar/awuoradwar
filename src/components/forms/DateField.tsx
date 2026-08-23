"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Language } from "@/lib/types";
import { inputClass } from "./FormShell";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseDateStr(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function todayStr(): string {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDisplay(value: string, locale: string): string {
  const parsed = parseDateStr(value);
  if (!parsed) return "";
  return new Date(Date.UTC(parsed.year, parsed.month, parsed.day, 12)).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Jan 1 2023 was a Sunday -- a fixed known-Sunday-start week to read locale
// weekday abbreviations off of via Intl. Uses "short" (Sun, Mon, ...) rather
// than single-letter "narrow" labels -- narrow makes Sunday and Saturday
// both render as "S", which reads as a bug (which end is which?).
// timeZone: "UTC" is required here -- these reference dates are built at UTC
// midnight, and toLocaleDateString with no explicit zone falls back to the
// browser's own local one. For anyone west of UTC (any US timezone), UTC
// midnight is still the previous evening locally, which silently rotates
// every label back by a day -- Sunday's slot shows "Sat", and so on around
// the row.
function weekdayInitials(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2023, 0, 1 + i)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })
  );
}

interface CalendarPopoverProps {
  initialValue: string;
  locale: string;
  lang: Language;
  onCancel: () => void;
  onDone: (value: string) => void;
}

function CalendarPopover({ initialValue, locale, lang, onCancel, onDone }: CalendarPopoverProps) {
  const initialParsed = parseDateStr(initialValue) || parseDateStr(todayStr())!;
  const [viewYear, setViewYear] = useState(initialParsed.year);
  const [viewMonth, setViewMonth] = useState(initialParsed.month);
  const [selected, setSelected] = useState(initialValue || "");

  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1, 12)).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1, 12)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0, 12)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const weekdays = weekdayInitials(locale);

  function goMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-xs rounded-2xl bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            aria-label={lang === "es" ? "Mes anterior" : "Previous month"}
            className="tap-target flex h-9 w-9 min-h-0 min-w-0 items-center justify-center rounded-full text-lg text-accent hover:bg-accent/10"
          >
            ‹
          </button>
          <p className="text-sm font-bold capitalize">{monthLabel}</p>
          <button
            type="button"
            onClick={() => goMonth(1)}
            aria-label={lang === "es" ? "Mes siguiente" : "Next month"}
            className="tap-target flex h-9 w-9 min-h-0 min-w-0 items-center justify-center rounded-full text-lg text-accent hover:bg-accent/10"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
          {weekdays.map((w, i) => (
            <div key={i} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const value = toDateStr(viewYear, viewMonth, day);
            const isSelected = value === selected;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(value)}
                className={`tap-target flex aspect-square min-h-0 items-center justify-center rounded-full text-sm ${
                  isSelected ? "bg-accent font-bold text-accent-foreground" : "text-foreground hover:bg-accent/10"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <button type="button" onClick={onCancel} className="text-sm font-semibold text-muted">
            {lang === "es" ? "Cancelar" : "Cancel"}
          </button>
          <button type="button" onClick={() => onDone(selected)} disabled={!selected} className="text-sm font-bold text-accent disabled:opacity-40">
            {lang === "es" ? "Listo" : "Done"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Custom date field replacing the browser's native <input type="date">,
 * whose calendar popup is OS chrome (a "Reset"/"Done" footer on iOS) that
 * the app has no way to relabel or restyle. Same visual slot and the same
 * two form-integration modes a plain <input> would need: pass `name` (plus
 * `defaultValue`) to drop into a native form submitted via FormData exactly
 * like the input it replaces, or pass `value`/`onChange` to use as a
 * controlled field in a client component managing its own state -- never
 * both. */
export default function DateField({
  name,
  value,
  defaultValue,
  onChange,
  required,
  lang,
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  lang: Language;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const current = isControlled ? value! : internalValue;
  const [open, setOpen] = useState(false);
  const locale = lang === "es" ? "es-MX" : "en-US";

  function commit(next: string) {
    if (isControlled) onChange?.(next);
    else setInternalValue(next);
    setOpen(false);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <button type="button" onClick={() => setOpen(true)} className={`${className || inputClass} flex items-center justify-between text-left`}>
        <span className={current ? "" : "text-muted/70"}>{current ? fmtDisplay(current, locale) : lang === "es" ? "Selecciona fecha" : "Select date"}</span>
        <span aria-hidden className="text-muted">
          📅
        </span>
      </button>
      {open && (
        <CalendarPopover initialValue={current} locale={locale} lang={lang} onCancel={() => setOpen(false)} onDone={commit} />
      )}
    </>
  );
}
