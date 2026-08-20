"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustInventoryStockAction,
  setInventoryStockAction,
  markInventoryOrderedAction,
  markInventoryReceivedAction,
  removeInventoryItemAction,
  updateInventoryItemGroupAction,
} from "@/app/actions/inventoryActions";
import { InventoryItem, InventoryCategory } from "@/lib/services/inventoryService";
import { Field, inputClass, selectClass, btnPrimary } from "./forms/FormShell";
import { Language } from "@/lib/types";

const CATEGORY_OPTIONS: Array<{ value: InventoryCategory; en: string; es: string }> = [
  { value: "SUPPLIES", en: "Supplies", es: "Suministros" },
  { value: "UNIFORMS", en: "Uniforms", es: "Uniformes" },
  { value: "EQUIPMENT", en: "Equipment", es: "Equipo" },
  { value: "TOOLS", en: "Tools", es: "Herramientas" },
  { value: "OTHER", en: "Other", es: "Otro" },
];

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

  function markReceived() {
    startTransition(async () => {
      setOptimisticOnOrder(false);
      await markInventoryReceivedAction(item.id);
      router.refresh();
    });
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
        // useful once a count runs into two or three digits. Stays visible
        // and editable even while on order -- the count is still real
        // information (e.g. what's left while you wait on the delivery).
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
      {/* A plain inline glyph, not a button/pill -- just enough to read "on
          order" at a glance without taking up row space the way the old
          "Ordered" badge + "Received" button pair did. */}
      {onOrder && (
        <span title={lang === "es" ? "Pedido" : "On order"} className="shrink-0 text-sm leading-none">
          🚚
        </span>
      )}
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        title={lang === "es" ? "Más" : "More"}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${moreOpen ? "bg-accent/10 text-accent" : "text-muted hover:text-accent"}`}
      >
        ⋯
      </button>
      {moreOpen &&
        (onOrder ? (
          <button
            type="button"
            disabled={pending}
            onClick={markReceived}
            className="flex h-7 min-h-0 items-center rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {lang === "es" ? "Recibido ✓" : "Received ✓"}
          </button>
        ) : orderOpen ? (
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

/** Name/category/notes/par level are shared across every row in a group
 * (even a multi-variant one), so editing them edits the whole group at
 * once rather than a single stepper's underlying item. */
function EditGroupForm({
  name,
  category,
  notes,
  parLevel,
  lang,
  onDone,
}: {
  name: string;
  category: InventoryCategory;
  notes: string;
  parLevel: string;
  lang: Language;
  onDone: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftCategory, setDraftCategory] = useState<InventoryCategory>(category);
  const [draftNotes, setDraftNotes] = useState(notes);
  const [draftPar, setDraftPar] = useState(parLevel);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <Field label={lang === "es" ? "Nombre" : "Name"}>
        <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Categoría" : "Category"}>
        <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value as InventoryCategory)} className={selectClass}>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {lang === "es" ? c.es : c.en}
            </option>
          ))}
        </select>
      </Field>
      <Field label={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}>
        <input value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Nivel mínimo (opcional)" : "Par level (optional)"}>
        <input value={draftPar} onChange={(e) => setDraftPar(e.target.value)} type="number" min={0} className={inputClass} />
      </Field>
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !draftName.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await updateInventoryItemGroupAction(name, category, {
                name: draftName,
                category: draftCategory,
                notes: draftNotes,
                parLevel: draftPar,
              });
              if (result && "error" in result && result.error) {
                setError(result.error);
                return;
              }
              onDone();
              router.refresh();
            });
          }}
          className={btnPrimary}
        >
          {lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="text-sm font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
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
  const [editing, setEditing] = useState(false);
  const singleItem = items.length === 1 && !items[0].variant;
  const category = items[0].category;
  const notes = items[0]?.notes || "";
  const parLevel = items[0]?.par_level != null ? String(items[0].par_level) : "";

  if (editing) {
    return (
      <div className="p-3">
        <EditGroupForm name={name} category={category} notes={notes} parLevel={parLevel} lang={lang} onDone={() => setEditing(false)} />
      </div>
    );
  }

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
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title={lang === "es" ? "Editar" : "Edit"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-muted transition-colors hover:text-accent"
          >
            ✎
          </button>
        )}
        <Stepper item={item} lang={lang} canManage={canManage} />
      </div>
    );
  }

  // Multiple variants (e.g. T-Shirt sizes) -- name on its own line, then a
  // wrapped grid of size chips, each boxed so a size stays visually grouped
  // with its own controls instead of running into its neighbor.
  return (
    <div className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title={lang === "es" ? "Editar" : "Edit"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-muted transition-colors hover:text-accent"
          >
            ✎
          </button>
        )}
      </div>
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
