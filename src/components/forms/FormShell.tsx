"use client";

import { ReactNode } from "react";
import { Language } from "@/lib/types";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  "tap-target w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-accent";
export const selectClass = inputClass;
export const textareaClass =
  "w-full rounded-xl border border-border bg-card px-3 py-2 text-base outline-none focus:border-accent";

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
      {error && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">{error}</p>}
      {status === "queued" && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-warning">
          {lang === "es" ? "En cola — se sincronizará automáticamente." : "Queued — will sync automatically."}
        </p>
      )}
      {status === "synced" && (
        <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-ok">{lang === "es" ? "Guardado." : "Saved."}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground disabled:opacity-60"
      >
        {pending ? "…" : label}
      </button>
    </div>
  );
}
