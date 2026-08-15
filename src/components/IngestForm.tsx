"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ingestTextAction } from "@/app/actions/importActions";
import { Language } from "@/lib/types";

export default function IngestForm({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await ingestTextAction(fd);
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
      className="card flex flex-col gap-2 p-3"
    >
      <input name="filename" placeholder={lang === "es" ? "Nombre del documento" : "Document name"} className="tap-target w-full rounded-xl border border-border bg-background px-3 text-sm" />
      <textarea
        name="text"
        required
        rows={4}
        placeholder={
          lang === "es"
            ? "Pega aquí el texto del plan quincenal de la empresa (línea por línea)…"
            : "Paste the company biweekly plan text here (one item per line)…"
        }
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button type="submit" disabled={pending} className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-60">
        {pending ? "…" : lang === "es" ? "Procesar" : "Process"}
      </button>
    </form>
  );
}
