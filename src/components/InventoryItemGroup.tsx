"use client";

import { useOptimistic, useState, useTransition } from "react";
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
 * group like T-Shirt). Order and Delete are tucked behind a "⋯" toggle --
 * only −/count/+ (the action taken dozens of times a shift) stay visible by
 * default, so a row of size chips doesn't turn into a wall of buttons. */
function Stepper({ item, lang, canManage }: { item: InventoryItem; lang: Language; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(item.stock_count));
  const [orderQty, setOrderQty] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // useOptimistic (not a plain flag) because this counter gets tapped
  // repeatedly in quick succession -- each tap needs to reconcile against
  // the LATEST optimistic value, not the stale server prop, and once the
  // real value lands via router.refresh() the override must clear itself
  // automatically rather than masking any later server-side change forever.
  const [displayCount, addOptimisticDelta] = useOptimistic(item.stock_count, (state, delta: number) => state + delta);
  const [onOrder, setOptimisticOnOrder] = useOptimistic(!!item.on_order, (_state, next: boolean) => next);
  const router = useRouter();

  const isLow = item.par_level != null && displayCount <= item.par_level;

  function adjust(delta: number) {
    startTransition(async () => {
      addOptimisticDelta(delta);
      await adjustInventoryStockAction(item.id, delta);
      router.refresh();
    });
  }

  function commitDraft() {
    const n = Number(draft);
    setEditing(false);
    if (!Number.isFinite(n) || n === displayCount) return;
    startTransition(async () => {
      addOptimisticDelta(n - displayCount);
      await setInventoryStockAction(item.id, n);
      router.refresh();
    });
  }

  // On order -- surfaced as a truck right next to the item instead of a text
  // pill, so it reads at a glance while scanning down a long list.
  if (onOrder) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span title={lang === "es" ? "Pedido" : "On order"} className="text-base leading-none">
          🚚
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setOptimisticOnOrder(false);
              await markInventoryReceivedAction(item.id);
              router.refresh();
            });
          }}
          className="tap-target flex h-7 min-h-0 items-center rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground disabled:opacity-50"
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
          className="h-7 w-10 rounded-md border border-accent bg-card text-center text-sm font-bold outline-none"
        />
      ) : (
        // Bordered like a real input (not plain text) -- the box itself is
        // the affordance that it's tappable to type a value directly,
        // useful once a count runs into two or three digits.
        <button
          type="button"
          onClick={() => { setDraft(String(displayCount)); setEditing(true); }}
          className={`h-7 w-10 rounded-md border text-center text-sm font-bold transition-colors hover:border-accent ${isLow ? "border-warning/50 text-warning" : "border-border text-foreground"}`}
        >
          {displayCount}
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
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        title={lang === "es" ? "Más" : "More"}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${moreOpen ? "bg-accent/10 text-accent" : "text-muted hover:text-accent"}`}
      >
        ⋯
      </button>
      {moreOpen &&
        (orderOpen ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
              placeholder={lang === "es" ? "Cant." : "Qty"}
              className="h-7 w-12 rounded-md border border-border bg-card px-1 text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOrderOpen(false);
                setMoreOpen(false);
                const qty = orderQty;
                setOrderQty("");
                startTransition(async () => {
                  setOptimisticOnOrder(true);
                  await markInventoryOrderedAction(item.id, qty);
                  router.refresh();
                });
              }}
              className="flex h-7 items-center rounded-md bg-accent px-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              ✓
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOrderOpen(true)}
            title={lang === "es" ? "Pedir" : "Order"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-muted transition-colors hover:text-accent"
          >
            📦
          </button>
        ))}
      {moreOpen && canManage && <RemoveButton id={item.id} lang={lang} />}
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
  const [expanded, setExpanded] = useState(false);
  const singleItem = items.length === 1 && !items[0].variant;

  // The common case -- one item, no size/variant -- is a single compact row:
  // name on the left, controls on the right, nothing else competing for space.
  // A long name still truncates by default, but tapping it toggles full
  // wrapped text -- otherwise a name like "Measuring Containers" is
  // permanently cut off with no way to confirm what it actually says.
  if (singleItem) {
    const item = items[0];
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className={expanded ? "text-sm font-medium" : "truncate text-sm font-medium"}>{name}</p>
          {item.notes && <p className={expanded ? "text-xs italic text-muted" : "truncate text-xs italic text-muted"}>{item.notes}</p>}
        </button>
        <Stepper item={item} lang={lang} canManage={canManage} />
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
            <span className="w-6 shrink-0 text-xs font-bold text-muted">{it.variant}</span>
            <Stepper item={it} lang={lang} canManage={canManage} />
          </div>
        ))}
      </div>
      {items[0]?.notes && <p className="mt-1.5 text-xs italic text-muted">{items[0].notes}</p>}
    </div>
  );
}
