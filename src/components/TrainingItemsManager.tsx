"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTrainingItemAction,
  updateTrainingItemAction,
  reorderTrainingItemsAction,
  removeTrainingItemAction,
} from "@/app/actions/trainingActions";
import { TrainingItem, TrainingItemPhase, TrainingPosition } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL, TRAINING_POSITIONS, TRAINING_PHASE_LABEL, TRAINING_PHASES } from "@/lib/trainingLabels";
import { Language } from "@/lib/types";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Add-a-step form -- pulled out so it can render once at the top of a
 * position's list instead of after every existing item, which used to mean
 * scrolling past the whole checklist just to add one more step. */
function AddItemForm({ position, lang }: { position: TrainingPosition; lang: Language }) {
  const [title, setTitle] = useState("");
  const [titleEs, setTitleEs] = useState("");
  const [phase, setPhase] = useState<TrainingItemPhase>("SHIFT");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          await addTrainingItemAction(position, title, titleEs, phase);
          setTitle("");
          setTitleEs("");
          router.refresh();
        });
      }}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-accent/40 p-2.5"
    >
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={lang === "es" ? "Agregar paso de capacitación" : "Add training step"}
          className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <button
          disabled={pending || !title.trim()}
          className="tap-target shrink-0 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
        >
          {lang === "es" ? "Agregar" : "Add"}
        </button>
      </div>
      <select value={phase} onChange={(e) => setPhase(e.target.value as TrainingItemPhase)} className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none">
        {TRAINING_PHASES.map((p) => (
          <option key={p} value={p}>
            {TRAINING_PHASE_LABEL[p][lang]}
          </option>
        ))}
      </select>
    </form>
  );
}

function ItemRow({ item, lang, onRemoved }: { item: TrainingItem; lang: Language; onRemoved: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [titleEs, setTitleEs] = useState(item.title_es || "");
  const [phase, setPhase] = useState<TrainingItemPhase>(item.phase);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="flex flex-col gap-2 p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none" />
        <input
          value={titleEs}
          onChange={(e) => setTitleEs(e.target.value)}
          placeholder={lang === "es" ? "Título en inglés ya existe -- opcional en español" : "Spanish title (optional)"}
          className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none"
        />
        <select value={phase} onChange={(e) => setPhase(e.target.value as TrainingItemPhase)} className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none">
          {TRAINING_PHASES.map((p) => (
            <option key={p} value={p}>
              {TRAINING_PHASE_LABEL[p][lang]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={() => {
              startTransition(async () => {
                await updateTrainingItemAction(item.id, title, titleEs, phase);
                setEditing(false);
                router.refresh();
              });
            }}
            className="h-8 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {lang === "es" ? "Guardar" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-xs font-medium text-muted">
            {lang === "es" ? "Cancelar" : "Cancel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 px-1 py-2 text-sm">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={lang === "es" ? "Arrastrar para reordenar" : "Drag to reorder"}
        className="tap-target flex w-8 shrink-0 cursor-grab touch-none items-center justify-center text-lg text-muted active:cursor-grabbing"
      >
        ⠿
      </button>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <button type="button" onClick={() => setEditing(true)} className="tap-target shrink-0 px-2 text-xs font-semibold text-accent">
        ✎
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          onRemoved(item.id);
          startTransition(async () => {
            try {
              await removeTrainingItemAction(item.id);
            } catch {
              router.refresh();
            }
          });
        }}
        className="tap-target shrink-0 px-2 text-xs font-semibold text-critical disabled:opacity-50"
      >
        {lang === "es" ? "Quitar" : "Remove"}
      </button>
    </div>
  );
}

/** One phase's worth of steps, reorderable by dragging the ⠿ handle instead
 * of tapping up/down arrows one step at a time -- for a checklist several
 * items long, moving something from the bottom to the top used to mean
 * repeated round trips to the server, one per step. Drag reorders instantly
 * in the UI and persists the whole new order in a single request. */
function SortablePhaseList({ items: initialItems, lang }: { items: TrainingItem[]; lang: Language }) {
  const [items, setItems] = useState(initialItems);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const router = useRouter();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);
    // Fire-and-forget so the drag feels instant -- if the persist actually
    // fails (e.g. a permission change mid-session), fall back to a full
    // refresh to resync with what the server has instead of leaving the
    // UI showing an order that never saved.
    reorderTrainingItemsAction(reordered.map((i) => i.id)).catch(() => router.refresh());
  }

  return (
    <div className="divide-y divide-border">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((it) => (
            <ItemRow key={it.id} item={it} lang={lang} onRemoved={(id) => setItems((prev) => prev.filter((i) => i.id !== id))} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PositionList({ position, label, items, lang }: { position: TrainingPosition; label: string; items: TrainingItem[]; lang: Language }) {
  const byPhase = new Map<TrainingItemPhase, TrainingItem[]>();
  for (const it of items) {
    if (!byPhase.has(it.phase)) byPhase.set(it.phase, []);
    byPhase.get(it.phase)!.push(it);
  }

  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between bg-accent/10 px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wide text-accent">{label}</span>
        <span className="shrink-0 text-xs font-semibold text-accent">{items.length}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">
        <AddItemForm position={position} lang={lang} />
        {TRAINING_PHASES.map((phase) => {
          const phaseItems = byPhase.get(phase) || [];
          if (phaseItems.length === 0) return null;
          return (
            <details key={phase} className="card overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">{TRAINING_PHASE_LABEL[phase][lang]}</span>
                <span className="shrink-0 text-xs font-semibold text-muted">{phaseItems.length}</span>
              </summary>
              <div className="border-t border-border">
                <SortablePhaseList items={phaseItems} lang={lang} />
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}

export default function TrainingItemsManager({ itemsByPosition, lang }: { itemsByPosition: Record<TrainingPosition, TrainingItem[]>; lang: Language }) {
  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-semibold">
        {lang === "es" ? "Administrar lista de capacitación" : "Manage training checklist"}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">
        {TRAINING_POSITIONS.map((p) => (
          <PositionList key={p} position={p} label={TRAINING_POSITION_LABEL[p][lang]} items={itemsByPosition[p]} lang={lang} />
        ))}
      </div>
    </details>
  );
}
