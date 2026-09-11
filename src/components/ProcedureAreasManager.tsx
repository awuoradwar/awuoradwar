"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAreaAction,
  deactivateAreaAction,
  addProcedureItemAction,
  updateProcedureItemAction,
  removeProcedureItemAction,
  updateAreaNameAction,
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

function ItemRow({ item, lang }: { item: ProcedureItem; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [textEs, setTextEs] = useState(item.text_es ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg bg-card-subtle px-2.5 py-2 text-sm">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          aria-label={es ? "Editar texto del paso" : "Edit item text"}
          className="tap-target rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <input
          value={textEs}
          onChange={(e) => setTextEs(e.target.value)}
          placeholder={es ? "Traducción al inglés -- opcional" : "Spanish translation (optional)"}
          className="tap-target rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        {error && <p className="text-xs text-critical">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateProcedureItemAction(item.id, text, textEs);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                setError(null);
                setEditing(false);
                router.refresh();
              })
            }
            className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-40"
          >
            {es ? "Guardar" : "Save"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setText(item.text);
              setTextEs(item.text_es ?? "");
              setError(null);
              setEditing(false);
            }}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted"
          >
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card-subtle px-2.5 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate">{item.text}</span>
      <span className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-accent">
          {es ? "Editar" : "Edit"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await removeProcedureItemAction(item.id); router.refresh(); })}
          className="text-xs font-semibold text-critical disabled:opacity-50"
        >
          {es ? "Quitar" : "Remove"}
        </button>
      </span>
    </div>
  );
}

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
            <ItemRow key={item.id} item={item} lang={lang} />
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

function AreaNameEditor({ area, lang }: { area: ProcedureArea; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const [nameEs, setNameEs] = useState(area.name_es ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${area.active ? "" : "text-muted line-through"}`}>{area.name}</span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setEditing(true);
          }}
          className="shrink-0 text-xs font-semibold text-accent"
        >
          {es ? "Editar" : "Edit"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.preventDefault()}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        aria-label={es ? "Nombre de la estación" : "Station name"}
        className="tap-target rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      <input
        value={nameEs}
        onChange={(e) => setNameEs(e.target.value)}
        placeholder={es ? "Traducción al inglés -- opcional" : "Spanish translation (optional)"}
        className="tap-target rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateAreaNameAction(area.id, name, nameEs);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setError(null);
              setEditing(false);
              router.refresh();
            })
          }
          className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-40"
        >
          {es ? "Guardar" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setName(area.name);
            setNameEs(area.name_es ?? "");
            setError(null);
            setEditing(false);
          }}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted"
        >
          {es ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function AreaCard({ area, items, lang }: { area: ProcedureArea; items: ProcedureItem[]; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const es = lang === "es";
  const closing = items.filter((i) => i.shift_type === "CLOSING");

  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <AreaNameEditor area={area} lang={lang} />
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted">{closing.length}</span>
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
        {/* Opening checklists aren't in use yet -- only closing, for now
         * (see ProcedureKiosk) -- so this only manages the closing list. Any
         * opening items from before that decision stay in the database
         * untouched, just not editable here until opening comes back. */}
        <ChecklistSection areaId={area.id} shiftType="CLOSING" label={es ? "Lista de cierre" : "Closing checklist"} items={closing} lang={lang} />
      </div>
    </details>
  );
}

export default function ProcedureAreasManager({ areas, itemsByArea, lang }: { areas: ProcedureArea[]; itemsByArea: Record<string, ProcedureItem[]>; lang: Language }) {
  const [name, setName] = useState("");
  const [nameEs, setNameEs] = useState("");
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
            setNameEs("");
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
        <Field label={es ? "Traducción al inglés -- opcional" : "Spanish translation (optional)"}>
          <input name="nameEs" value={nameEs} onChange={(e) => setNameEs(e.target.value)} placeholder={es ? "Se traduce automáticamente si se deja en blanco" : "Auto-translated if left blank"} className={inputClass} />
        </Field>
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
