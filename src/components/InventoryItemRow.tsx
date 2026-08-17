"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markInventoryLowAction, markInventoryOrderedAction, markInventoryReceivedAction, removeInventoryItemAction } from "@/app/actions/inventoryActions";
import { InventoryItem } from "@/lib/services/inventoryService";
import { Language } from "@/lib/types";

const CATEGORY_LABEL: Record<string, Record<Language, string>> = {
  SUPPLIES: { en: "Supplies", es: "Suministros" },
  UNIFORMS: { en: "Uniforms", es: "Uniformes" },
  EQUIPMENT: { en: "Equipment", es: "Equipo" },
  TOOLS: { en: "Tools", es: "Herramientas" },
  OTHER: { en: "Other", es: "Otro" },
};

const STATUS_STYLE: Record<string, string> = {
  OK: "bg-ok/10 text-ok",
  LOW: "bg-warning/10 text-warning",
  ORDERED: "bg-accent/10 text-accent",
};

export default function InventoryItemRow({ item, lang, canManage }: { item: InventoryItem; lang: Language; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState("");
  const [orderingOpen, setOrderingOpen] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted">{CATEGORY_LABEL[item.category]?.[lang] || item.category}</p>
          {item.notes && <p className="mt-0.5 text-xs text-muted italic">{item.notes}</p>}
          {item.status === "ORDERED" && item.last_ordered_at && (
            <p className="mt-0.5 text-[11px] text-muted">
              {lang === "es" ? "Pedido" : "Ordered"} {new Date(item.last_ordered_at).toLocaleDateString()}
              {item.last_ordered_qty ? ` · ${item.last_ordered_qty}` : ""}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>{item.status}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.status === "OK" && (
          <button
            disabled={pending}
            onClick={() => run(() => markInventoryLowAction(item.id))}
            className="tap-target rounded-full border border-warning px-3 text-xs font-semibold text-warning disabled:opacity-50"
          >
            {lang === "es" ? "Marcar Bajo" : "Mark Low"}
          </button>
        )}
        {item.status === "LOW" && !orderingOpen && (
          <button
            disabled={pending}
            onClick={() => setOrderingOpen(true)}
            className="tap-target rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {lang === "es" ? "Marcar Pedido" : "Mark Ordered"}
          </button>
        )}
        {item.status === "LOW" && orderingOpen && (
          <div className="flex items-center gap-1.5">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={lang === "es" ? "Cantidad" : "Qty"}
              className="tap-target w-20 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-accent"
            />
            <button
              disabled={pending}
              onClick={() => run(async () => { await markInventoryOrderedAction(item.id, qty); setOrderingOpen(false); setQty(""); })}
              className="tap-target rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {lang === "es" ? "Confirmar" : "Confirm"}
            </button>
          </div>
        )}
        {item.status === "ORDERED" && (
          <button
            disabled={pending}
            onClick={() => run(() => markInventoryReceivedAction(item.id))}
            className="tap-target rounded-full border-2 border-ok px-3 text-xs font-semibold text-ok disabled:opacity-50"
          >
            {lang === "es" ? "Marcar Recibido" : "Mark Received"}
          </button>
        )}
        {canManage && (
          <button
            disabled={pending}
            onClick={() => run(() => removeInventoryItemAction(item.id))}
            className="tap-target ml-auto px-2 text-xs font-medium text-critical disabled:opacity-50"
          >
            {lang === "es" ? "Quitar" : "Remove"}
          </button>
        )}
      </div>
    </div>
  );
}
