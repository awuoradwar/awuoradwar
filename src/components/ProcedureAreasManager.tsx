"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAreaAction,
  deactivateAreaAction,
  addProcedureItemAction,
  removeProcedureItemAction,
} from "@/app/actions/procedureActions";
import { ProcedureArea, ProcedureCategory, ProcedureItem, ProcedureShiftType } from "@/lib/services/procedureService";
import { Language } from "@/lib/types";
import { Field, inputClass, selectClass, btnPrimary, btnDanger } from "./forms/FormShell";

const CATEGORY_LABEL: Record<ProcedureCategory, Record<Language, string>> = {
  FOH: { en: "Front of House", es: "Área de Clientes" },
  BOH: { en: "Back of House", es: "Área de Cocina" },
  PATIO_WINDOWS: { en: "Patio & Windows", es: "Patio y Ventanas" },
};
const CATEGORIES: ProcedureCategory[] = ["FOH", "BOH", "PATIO_WINDOWS"];

function ChecklistSection({
  areaId,
  shiftType,
  label,
  items,
  lang,
}: {
  areaId: string;
  shiftType: ProcedureShiftType;
  label: string;
  items: ProcedureItem[];
  lang: Language;
}) {
  const [text, setText] = useState("");
  const [textEs, setTextEs] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      {items.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-card-subtle px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.text}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await removeProcedureItemAction(item.id); router.refresh(); })}
                className="shrink-0 text-xs font-semibold text-critical disabled:opacity-50"
              >
                {es ? "Quitar" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          startTransition(async () => {
            await addProcedureItemAction(areaId, shiftType, text, textEs);
            setText("");
            setTextEs("");
            router.refresh();
          });
        }}
        className="flex flex-col gap-1.5"
      >
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={es ? "Agregar un paso" : "Add a step"}
            className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <button type="submit" disabled={pending || !text.trim()} className="tap-target shrink-0 rounded-xl bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-40">
            {es ? "Agregar" : "Add"}
          </button>
        </div>
        <input
          value={textEs}
          onChange={(e) => setTextEs(e.target.value)}
          placeholder={es ? "Traducción al inglés ya existe -- opcional" : "Spanish translation (optional)"}
          className="tap-target rounded-xl border border-border bg-card px-3 text-sm outline-none hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </form>
    </div>
  );
}

function AreaCard({ area, items, lang }: { area: ProcedureArea; items: ProcedureItem[]; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";
  const opening = items.filter((i) => i.shift_type === "OPENING");
  const closing = items.filter((i) => i.shift_type === "CLOSING");

  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
        <span className={`text-sm font-semibold ${area.active ? "" : "text-muted line-through"}`}>{area.name}</span>
        <span className="shrink-0 text-xs font-semibold text-muted">{opening.length + closing.length}</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">
        {area.active === 1 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await deactivateAreaAction(area.id); router.refresh(); })}
            className={`self-start ${btnDanger}`}
          >
            {es ? "Desactivar estación" : "Deactivate area"}
          </button>
        )}
        <ChecklistSection areaId={area.id} shiftType="OPENING" label={es ? "Lista de apertura" : "Opening checklist"} items={opening} lang={lang} />
        <ChecklistSection areaId={area.id} shiftType="CLOSING" label={es ? "Lista de cierre" : "Closing checklist"} items={closing} lang={lang} />
      </div>
    </details>
  );
}

export default function ProcedureAreasManager({ areas, itemsByArea, lang }: { areas: ProcedureArea[]; itemsByArea: Record<string, ProcedureItem[]>; lang: Language }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProcedureCategory>("FOH");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const result = await createAreaAction(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setError(null);
            setName("");
            router.refresh();
          });
        }}
        className="flex flex-col gap-2"
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label={es ? "Nombre de la estación" : "Station name"}>
            <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={es ? "Mostrador Principal" : "Front Counter"} className={inputClass} />
          </Field>
          <Field label={es ? "Categoría" : "Category"}>
            <select name="category" value={category} onChange={(e) => setCategory(e.target.value as ProcedureCategory)} className={selectClass}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c][lang]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button type="submit" disabled={pending} className={`self-start ${btnPrimary}`}>
          {pending ? "…" : es ? "Agregar estación" : "Add station"}
        </button>
      </form>

      {CATEGORIES.map((c) => {
        const inCategory = areas.filter((a) => a.category === c);
        if (inCategory.length === 0) return null;
        return (
          <div key={c}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{CATEGORY_LABEL[c][lang]}</h3>
            <div className="flex flex-col gap-2">
              {inCategory.map((a) => (
                <AreaCard key={a.id} area={a} items={itemsByArea[a.id] || []} lang={lang} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
