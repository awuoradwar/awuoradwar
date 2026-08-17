"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cycleInventoryStatusAction, setInventoryOrderQtyAction, removeInventoryItemAction } from "@/app/actions/inventoryActions";
import { InventoryItem, InventoryStatus } from "@/lib/services/inventoryService";
import { Language } from "@/lib/types";

const STATUS_STYLE: Record<InventoryStatus, string> = {
  OK: "bg-ok/10 text-ok border-ok/30",
  LOW: "bg-warning/10 text-warning border-warning/40",
  ORDERED: "bg-accent/10 text-accent border-accent/40",
};

function StatusChip({ item, lang }: { item: InventoryItem; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [qtyOpen, setQtyOpen] = useState(false);
  const [qty, setQty] = useState(item.last_ordered_qty || "");
  const router = useRouter();

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await cycleInventoryStatusAction(item.id, item.status);
            router.refresh();
          })
        }
        title={item.variant ? `${item.variant} — ${item.status}` : item.status}
        className={`tap-target flex min-w-[3.25rem] flex-col items-center rounded-lg border py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${STATUS_STYLE[item.status]}`}
      >
        {item.variant && <span className="text-xs">{item.variant}</span>}
        <span>{item.status}</span>
      </button>
      {item.status === "ORDERED" && (
        <button
          type="button"
          onClick={() => setQtyOpen((o) => !o)}
          className="tap-target px-1 text-xs text-muted"
          title={lang === "es" ? "Cantidad" : "Quantity"}
        >
          ✎
        </button>
      )}
      {qtyOpen && (
        <div className="flex items-center gap-1">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={lang === "es" ? "Cant." : "Qty"}
            className="tap-target w-16 rounded-lg border border-border bg-card px-1.5 text-xs outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await setInventoryOrderQtyAction(item.id, qty);
                setQtyOpen(false);
                router.refresh();
              })
            }
            className="tap-target rounded-lg bg-foreground px-2 text-xs font-semibold text-background"
          >
            ✓
          </button>
        </div>
      )}
    </div>
  );
}

export default function InventoryItemGroup({ name, items, lang, canManage }: { name: string; items: InventoryItem[]; lang: Language; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="px-3 py-2.5">
      <p className="mb-1.5 text-sm font-medium">{name}</p>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((it) => (
          <StatusChip key={it.id} item={it} lang={lang} />
        ))}
      </div>
      {items[0]?.notes && <p className="mt-1 text-xs italic text-muted">{items[0].notes}</p>}
      {items.some((it) => it.status === "ORDERED" && it.last_ordered_at) && (
        <p className="mt-1 text-[11px] text-muted">
          {lang === "es" ? "Pedido" : "Ordered"}{" "}
          {new Date(items.find((it) => it.status === "ORDERED")!.last_ordered_at!).toLocaleDateString()}
        </p>
      )}
      {canManage && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-critical">{lang === "es" ? "Quitar…" : "Remove…"}</summary>
          <div className="mt-1 flex flex-wrap gap-2">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await removeInventoryItemAction(it.id); router.refresh(); })}
                className="tap-target rounded-lg border border-critical/40 px-2 py-1 text-[11px] text-critical disabled:opacity-50"
              >
                {it.variant || name}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
