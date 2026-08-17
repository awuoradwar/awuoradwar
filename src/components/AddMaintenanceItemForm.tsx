"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMaintenanceItemAction } from "@/app/actions/inventoryActions";
import { Language } from "@/lib/types";

export default function AddMaintenanceItemForm({ lang }: { lang: Language }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [intervalDays, setIntervalDays] = useState("90");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setError(null);
        startTransition(async () => {
          const result = await addMaintenanceItemAction(name, location, Number(intervalDays), notes);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setName("");
          setLocation("");
          setNotes("");
          router.refresh();
        });
      }}
      className="card flex flex-col gap-2 p-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={lang === "es" ? "ej. Filtro de agua" : "e.g. Water filter"}
        className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={lang === "es" ? "Ubicación (opcional)" : "Location (optional)"}
          className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            className="tap-target w-full rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <span className="shrink-0 text-xs text-muted">{lang === "es" ? "días" : "days"}</span>
        </div>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}
        className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      <button
        disabled={pending || !name.trim()}
        className="tap-target rounded-xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
      >
        {lang === "es" ? "Agregar artículo de mantenimiento" : "Add maintenance item"}
      </button>
    </form>
  );
}
