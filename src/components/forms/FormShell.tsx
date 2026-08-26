"use client";

import { ReactNode, useState } from "react";
import { Language } from "@/lib/types";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}

const fieldBase =
  "tap-target w-full rounded-xl border border-border bg-card px-3.5 text-base text-foreground outline-none " +
  "transition-colors placeholder:text-muted/70 " +
  "hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15";

export const inputClass = fieldBase;
export const selectClass = fieldBase;
export const textareaClass = `${fieldBase} py-2.5 leading-snug`;

/** One size for every row-level action button (Complete, Cancel, Edit,
 * Reopen, Verify, Settle, ...) app-wide -- they vary only by color/fill, never
 * by height, padding, or font-weight, so a row of two or three actions next
 * to each other always reads as one deliberate set instead of the odd one
 * out looking smaller or different. Deliberately smaller than the
 * `tap-target` 48px floor used for primary screen-level buttons -- on a
 * dense card of text-sm/text-xs content, a 48px pill reads as oversized
 * next to it; h-9 stays comfortably tappable without dominating the row. */
const actionBase = "h-9 min-h-0 inline-flex items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-50";
export const btnPrimary = `${actionBase} bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover`;
export const btnOutline = `${actionBase} border border-accent text-accent hover:bg-accent hover:text-accent-foreground`;
export const btnDanger = `${actionBase} border border-critical/40 text-critical hover:bg-critical/10`;
export const btnNeutral = `${actionBase} border border-border text-muted hover:border-muted/50`;
export const btnOk = `${actionBase} border-2 border-ok text-ok hover:bg-ok/10`;

/** File inputs render with the browser's own default styling, which barely
 * changes once a file is picked -- the button and the resulting filename end
 * up nearly the same color/weight, so it's genuinely hard to tell whether an
 * upload registered. This makes the "chosen" state unmistakable: a clearly
 * app-styled button, plus a status line that's a completely different color
 * and icon depending on whether a file is actually attached. */
export function FileField({
  name,
  accept,
  required,
  capture,
  multiple,
  lang,
}: {
  name: string;
  accept?: string;
  required?: boolean;
  capture?: boolean | "user" | "environment";
  /** Lets the same picked-name/status UI cover a multi-file input (e.g.
   * several meeting-note photos/documents at once) -- the browser's own
   * FormData.getAll(name) already collects every file from one <input
   * multiple>, no need for repeated single-file inputs. */
  multiple?: boolean;
  lang: Language;
}) {
  const [fileNames, setFileNames] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="tap-target inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-accent px-3.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/5">
        <span aria-hidden>📎</span>
        {multiple ? (lang === "es" ? "Elegir archivos" : "Choose files") : lang === "es" ? "Elegir archivo" : "Choose file"}
        <input
          name={name}
          type="file"
          accept={accept}
          required={required}
          capture={capture}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => setFileNames(e.target.files ? Array.from(e.target.files).map((f) => f.name) : [])}
        />
      </label>
      {fileNames.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-ok">
          <span aria-hidden>✓</span>
          <span className="truncate">{fileNames.join(", ")}</span>
        </p>
      ) : (
        <p className="text-xs italic text-muted">
          {multiple
            ? lang === "es"
              ? "Ningún archivo seleccionado"
              : "No files selected"
            : lang === "es"
              ? "Ningún archivo seleccionado"
              : "No file selected"}
        </p>
      )}
    </div>
  );
}

/** Live preview of a "one per line" textarea as the actual bulleted list it
 * becomes once saved -- typing "Talk to BOH" and only seeing that flat line
 * back, with no bullet, gave no sense of the finished note until after
 * saving. Renders nothing when there's no non-blank line yet, so an empty
 * section doesn't show a hint of an empty list. */
export function BulletPreview({ text }: { text: string }) {
  const bullets = text.split("\n").map((b) => b.trim()).filter(Boolean);
  if (bullets.length === 0) return null;
  return (
    <ul className="list-disc space-y-0.5 rounded-lg bg-card-subtle px-3 py-2 pl-7 text-sm text-foreground">
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

export function SubmitBar({
  pending,
  error,
  status,
  lang,
  label,
}: {
  pending: boolean;
  error: string | null;
  status: "idle" | "synced" | "queued";
  lang: Language;
  label: string;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border-l-4 border-critical bg-critical/[0.06] px-3 py-2 text-sm text-critical">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      )}
      {status === "queued" && (
        <p className="flex items-start gap-2 rounded-lg border-l-4 border-warning bg-warning/[0.08] px-3 py-2 text-sm text-warning">
          <span aria-hidden>⏳</span>
          {lang === "es" ? "En cola — se sincronizará automáticamente." : "Queued — will sync automatically."}
        </p>
      )}
      {status === "synced" && (
        <p className="flex items-start gap-2 rounded-lg border-l-4 border-ok bg-ok/[0.08] px-3 py-2 text-sm text-ok">
          <span aria-hidden>✓</span>
          {lang === "es" ? "Guardado." : "Saved."}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover active:bg-accent-hover disabled:opacity-60 disabled:hover:bg-accent"
      >
        {pending ? "…" : label}
      </button>
    </div>
  );
}
