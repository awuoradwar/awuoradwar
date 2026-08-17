"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustInventoryStockAction,
  setInventoryStockAction,
  markInventoryOrderedAction,
  markInventoryReceivedAction,
  removeInventoryItemAction,
} from "@/app/actions/inventoryActions";
import { InventoryItem } from "@/lib/services/inventoryService";
import { Language } from "@/lib/types";

function StockCard({ item, lang }: { item: InventoryItem; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(item.stock_count));
  const [orderQty, setOrderQty] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const router = useRouter();

  const isLow = item.par_level != null && item.stock_count <= item.par_level;

  function adjust(delta: number) {
    startTransition(async () => {
      await adjustInventoryStockAction(item.id, delta);
      router.refresh();
    });
  }

  function commitDraft() {
    const n = Number(draft);
    setEditing(false);
    if (!Number.isFinite(n) || n === item.stock_count) return;
    startTransition(async () => {
      await setInventoryStockAction(item.id, n);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex min-w-[4.75rem] flex-col items-center gap-1.5 rounded-xl border px-2 py-2 transition-colors ${
        item.on_order ? "border-accent/50 bg-accent/5" : isLow ? "border-warning/50 bg-warning/5" : "border-border"
      }`}
    >
      <span className="text-xs font-bold text-muted">{item.variant || " "}</span>

      {item.on_order ? (
        <>
          <span className="text-[10px] font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Pedido" : "Ordered"}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await markInventoryReceivedAction(item.id); router.refresh(); })}
            className="rounded-full bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground disabled:opacity-50"
          >
            {lang === "es" ? "Recibido ✓" : "Received ✓"}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => adjust(-1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-sm font-bold text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              −
            </button>
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => e.key === "Enter" && commitDraft()}
                inputMode="numeric"
                className="w-9 rounded-md border border-accent bg-card text-center text-sm font-bold outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setDraft(String(item.stock_count)); setEditing(true); }}
                className={`w-9 rounded-md text-center text-sm font-bold ${isLow ? "text-warning" : "text-foreground"}`}
              >
                {item.stock_count}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => adjust(1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-sm font-bold text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              +
            </button>
          </div>
          {!orderOpen ? (
            <button
              type="button"
              onClick={() => setOrderOpen(true)}
              className="text-[10px] font-semibold text-accent"
            >
              {lang === "es" ? "Pedir" : "Order"}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                placeholder={lang === "es" ? "Cant." : "Qty"}
                className="w-12 rounded-md border border-border bg-card px-1 text-[10px] outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markInventoryOrderedAction(item.id, orderQty);
                    setOrderOpen(false);
                    setOrderQty("");
                    router.refresh();
                  })
                }
                className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground disabled:opacity-50"
              >
                ✓
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function InventoryItemGroup({ name, items, lang, canManage }: { name: string; items: InventoryItem[]; lang: Language; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-sm font-medium">{name}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <StockCard key={it.id} item={it} lang={lang} />
        ))}
      </div>
      {items[0]?.notes && <p className="mt-1.5 text-xs italic text-muted">{items[0].notes}</p>}
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
