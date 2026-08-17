"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addInventoryItemAction } from "@/app/actions/inventoryActions";
import { InventoryCategory } from "@/lib/services/inventoryService";
import { Language } from "@/lib/types";

const CATEGORIES: Array<{ value: InventoryCategory; en: string; es: string }> = [
  { value: "SUPPLIES", en: "Supplies", es: "Suministros" },
  { value: "UNIFORMS", en: "Uniforms", es: "Uniformes" },
  { value: "EQUIPMENT", en: "Equipment", es: "Equipo" },
  { value: "TOOLS", en: "Tools", es: "Herramientas" },
  { value: "OTHER", en: "Other", es: "Otro" },
];

export default function AddInventoryItemForm({ lang }: { lang: Language }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("SUPPLIES");
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
          const result = await addInventoryItemAction(name, category, notes);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setName("");
          setNotes("");
          router.refresh();
        });
      }}
      className="card flex flex-col gap-2 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={lang === "es" ? "Nombre del artículo" : "Item name"}
          className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as InventoryCategory)}
          className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {lang === "es" ? c.es : c.en}
            </option>
          ))}
        </select>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={lang === "es" ? "Notas (opcional, ej. reordenar con 2 cajas)" : "Notes (optional, e.g. reorder at 2 cases)"}
        className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      <button
        disabled={pending || !name.trim()}
        className="tap-target rounded-xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
      >
        {lang === "es" ? "Agregar artículo" : "Add item"}
      </button>
    </form>
  );
}
