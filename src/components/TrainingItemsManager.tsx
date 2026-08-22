"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTrainingItemAction, updateTrainingItemAction, moveTrainingItemAction, removeTrainingItemAction } from "@/app/actions/trainingActions";
import { TrainingItem, TrainingItemPhase, TrainingPosition } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL, TRAINING_POSITIONS, TRAINING_PHASE_LABEL, TRAINING_PHASES } from "@/lib/trainingLabels";
import { Language } from "@/lib/types";

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

function ItemRow({
  item,
  lang,
  isFirst,
  isLast,
}: {
  item: TrainingItem;
  lang: Language;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [titleEs, setTitleEs] = useState(item.title_es || "");
  const [phase, setPhase] = useState<TrainingItemPhase>(item.phase);
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);
  const router = useRouter();

  if (removed) return null;

  if (editing) {
    return (
      <div className="flex flex-col gap-2 p-3">
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
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          disabled={pending || isFirst}
          onClick={() => startTransition(async () => { await moveTrainingItemAction(item.id, "up"); router.refresh(); })}
          className="flex h-5 w-6 items-center justify-center text-muted disabled:opacity-25"
          title={lang === "es" ? "Subir" : "Move up"}
        >
          ▲
        </button>
        <button
          type="button"
          disabled={pending || isLast}
          onClick={() => startTransition(async () => { await moveTrainingItemAction(item.id, "down"); router.refresh(); })}
          className="flex h-5 w-6 items-center justify-center text-muted disabled:opacity-25"
          title={lang === "es" ? "Bajar" : "Move down"}
        >
          ▼
        </button>
      </div>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-accent">
        ✎
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setRemoved(true);
          startTransition(async () => {
            try {
              await removeTrainingItemAction(item.id);
            } catch {
              setRemoved(false);
            }
            router.refresh();
          });
        }}
        className="tap-target shrink-0 px-2 text-xs font-semibold text-critical disabled:opacity-50"
      >
        {lang === "es" ? "Quitar" : "Remove"}
      </button>
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
            <div key={phase}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{TRAINING_PHASE_LABEL[phase][lang]}</p>
              <div className="card divide-y divide-border">
                {phaseItems.map((it, i) => (
                  <ItemRow key={it.id} item={it} lang={lang} isFirst={i === 0} isLast={i === phaseItems.length - 1} />
                ))}
              </div>
            </div>
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
