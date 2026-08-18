"use client";

import { useMemo, useState } from "react";
import InventoryItemGroup from "./InventoryItemGroup";
import { InventoryItem, InventoryCategory } from "@/lib/services/inventoryService";
import { Language } from "@/lib/types";

export interface InventoryGroup {
  name: string;
  category: InventoryCategory;
  items: InventoryItem[];
}

const CATEGORY_ORDER: InventoryCategory[] = ["SUPPLIES", "TOOLS", "UNIFORMS", "EQUIPMENT", "OTHER"];
const CATEGORY_LABEL: Record<InventoryCategory, Record<Language, string>> = {
  SUPPLIES: { en: "Supplies", es: "Suministros" },
  TOOLS: { en: "Tools", es: "Herramientas" },
  UNIFORMS: { en: "Uniforms", es: "Uniformes" },
  EQUIPMENT: { en: "Equipment", es: "Equipo" },
  OTHER: { en: "Other", es: "Otro" },
};
const CATEGORY_ICON: Record<InventoryCategory, string> = {
  SUPPLIES: "🧴",
  TOOLS: "🔧",
  UNIFORMS: "👕",
  EQUIPMENT: "📦",
  OTHER: "🗂️",
};

export default function InventorySupplies({ groups, lang, canManage }: { groups: InventoryGroup[]; lang: Language; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  const byCategory = useMemo(() => {
    const map = new Map<InventoryCategory, InventoryGroup[]>();
    for (const g of filtered) {
      if (!map.has(g.category)) map.set(g.category, []);
      map.get(g.category)!.push(g);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={lang === "es" ? "Buscar artículo…" : "Search items…"}
        className="tap-target rounded-xl border border-border bg-card px-3.5 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      {filtered.length === 0 ? (
        <div className="card p-4 text-center text-sm text-muted">
          {lang === "es" ? "No se encontraron artículos." : "No items found."}
        </div>
      ) : hasQuery ? (
        // Searching: skip the accordion entirely and show every match, grouped
        // by category, always expanded -- you typed a name, you want it now.
        CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
          <div key={cat}>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
              {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat][lang]}
            </p>
            <div className="card divide-y divide-border">
              {byCategory.get(cat)!.map((g) => (
                <InventoryItemGroup key={`${g.category}-${g.name}`} name={g.name} items={g.items} lang={lang} canManage={canManage} />
              ))}
            </div>
          </div>
        ))
      ) : (
        // Not searching: one collapsed section per category, so scrolling
        // through the whole list never mixes categories together, and you
        // always know exactly which one you're looking at.
        CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => {
          const catGroups = byCategory.get(cat)!;
          const itemCount = catGroups.reduce((sum, g) => sum + g.items.length, 0);
          return (
            <details key={cat} className="card overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between bg-accent/10 px-3 py-2.5">
                <span className="text-sm font-bold text-accent">
                  {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat][lang]}
                </span>
                <span className="shrink-0 text-xs font-semibold text-accent">{itemCount}</span>
              </summary>
              <div className="divide-y divide-border border-t border-border">
                {catGroups.map((g) => (
                  <InventoryItemGroup key={`${g.category}-${g.name}`} name={g.name} items={g.items} lang={lang} canManage={canManage} />
                ))}
              </div>
            </details>
          );
        })
      )}
    </div>
  );
}
