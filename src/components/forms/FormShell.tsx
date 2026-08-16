"use client";

import { ReactNode } from "react";
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
