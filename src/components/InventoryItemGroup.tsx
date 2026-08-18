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

/** The +/-/count/Order controls for one item or size. Used both inline (a
 * single-variant item's whole row) and inside a size chip (a multi-variant
 * group like T-Shirt). */
function Stepper({ item, lang }: { item: InventoryItem; lang: Language }) {
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

  if (item.on_order) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
          {lang === "es" ? "Pedido" : "Ordered"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await markInventoryReceivedAction(item.id); router.refresh(); })}
          className="tap-target flex h-7 min-h-0 items-center rounded-full bg-accent px-2 text-[10px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {lang === "es" ? "Recibido ✓" : "Received ✓"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
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
          className="h-7 w-8 rounded-md border border-accent bg-card text-center text-sm font-bold outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(String(item.stock_count)); setEditing(true); }}
          className={`h-7 w-8 rounded-md text-center text-sm font-bold ${isLow ? "text-warning" : "text-foreground"}`}
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
      {!orderOpen ? (
        <button
          type="button"
          onClick={() => setOrderOpen(true)}
          title={lang === "es" ? "Pedir" : "Order"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-muted transition-colors hover:text-accent"
        >
          📦
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <input
            value={orderQty}
            onChange={(e) => setOrderQty(e.target.value)}
            placeholder={lang === "es" ? "Cant." : "Qty"}
            className="h-7 w-12 rounded-md border border-border bg-card px-1 text-[10px] outline-none focus:border-accent"
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
            className="flex h-7 items-center rounded-md bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground disabled:opacity-50"
          >
            ✓
          </button>
        </div>
      )}
    </div>
  );
}

function RemoveButton({ id, lang }: { id: string; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title={lang === "es" ? "Quitar" : "Remove"}
      onClick={() => startTransition(async () => { await removeInventoryItemAction(id); router.refresh(); })}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-muted transition-colors hover:text-critical disabled:opacity-40"
    >
      🗑
    </button>
  );
}

export default function InventoryItemGroup({ name, items, lang, canManage }: { name: string; items: InventoryItem[]; lang: Language; canManage: boolean }) {
  const singleItem = items.length === 1 && !items[0].variant;

  // The common case -- one item, no size/variant -- is a single compact row:
  // name on the left, controls on the right, nothing else competing for space.
  if (singleItem) {
    const item = items[0];
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          {item.notes && <p className="truncate text-[11px] italic text-muted">{item.notes}</p>}
        </div>
        <Stepper item={item} lang={lang} />
        {canManage && <RemoveButton id={item.id} lang={lang} />}
      </div>
    );
  }

  // Multiple variants (e.g. T-Shirt sizes) -- name on its own line, then a
  // wrapped grid of size chips, each boxed so a size stays visually grouped
  // with its own controls instead of running into its neighbor.
  return (
    <div className="px-3 py-2.5">
      <p className="mb-1.5 text-sm font-medium">{name}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-1.5 rounded-lg border border-border py-1 pl-2 pr-1">
            <span className="w-6 shrink-0 text-[10px] font-bold text-muted">{it.variant}</span>
            <Stepper item={it} lang={lang} />
            {canManage && <RemoveButton id={it.id} lang={lang} />}
          </div>
        ))}
      </div>
      {items[0]?.notes && <p className="mt-1.5 text-xs italic text-muted">{items[0].notes}</p>}
    </div>
  );
}
