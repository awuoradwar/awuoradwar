"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWasteEntryAction, updateWasteEntryAction } from "@/app/actions/operationsActions";
import { Field, inputClass, selectClass, textareaClass } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";
import { WasteLogEntry } from "@/lib/services/wasteService";
import { UNITS_EN, UNITS_ES, translateWasteUnit } from "@/lib/wasteUnits";

const REASON_LABEL: Record<string, { en: string; es: string }> = {
  SPOILED: { en: "Spoiled/expired", es: "Dañado/caducado" },
  OVERPREP: { en: "Over-prepped", es: "Sobre-preparado" },
  DROPPED: { en: "Dropped/contaminated", es: "Caído/contaminado" },
  QUALITY: { en: "Quality issue", es: "Problema de calidad" },
  OTHER: { en: "Other", es: "Otro" },
};

function EditWasteForm({ entry, lang, onDone }: { entry: WasteLogEntry; lang: Language; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const units = lang === "es" ? UNITS_ES : UNITS_EN;
  const displayUnit = translateWasteUnit(entry.unit, lang) || entry.unit;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateWasteEntryAction(fd);
          if (result && "error" in result && result.error) {
            setError(result.error);
            return;
          }
          setError(null);
          onDone();
          router.refresh();
        });
      }}
      className="flex flex-col gap-2 p-3"
    >
      <input type="hidden" name="id" value={entry.id} />
      <Field label={lang === "es" ? "Artículo" : "Item"}>
        <input name="item" defaultValue={entry.item} required className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={lang === "es" ? "Cantidad" : "Quantity"}>
          <input name="quantity" type="number" step="any" min="0" inputMode="decimal" defaultValue={entry.quantity} required className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Unidad" : "Unit"}>
          <select name="unit" defaultValue={displayUnit} className={selectClass}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={lang === "es" ? "Motivo (opcional)" : "Reason (optional)"}>
        <select name="reason" defaultValue={entry.reason || ""} className={selectClass}>
          <option value="">{lang === "es" ? "Sin especificar" : "Unspecified"}</option>
          {Object.entries(REASON_LABEL).map(([value, l]) => (
            <option key={value} value={value}>
              {lang === "es" ? l.es : l.en}
            </option>
          ))}
        </select>
      </Field>
      <Field label={lang === "es" ? "Fecha" : "Date"}>
        <DateField name="wastedDate" required defaultValue={entry.wasted_date} lang={lang} />
      </Field>
      <Field label={`${lang === "es" ? "Notas" : "Notes"} (${lang === "es" ? "opcional" : "optional"})`}>
        <textarea name="notes" rows={2} defaultValue={entry.notes || ""} className={textareaClass} />
      </Field>
      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          {lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="text-sm font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

export default function WasteLogRow({ entry, lang }: { entry: WasteLogEntry; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  if (optimisticallyDeleted) return null;

  if (editing) {
    return (
      <div className="border-t border-border first:border-t-0">
        <EditWasteForm entry={entry} lang={lang} onDone={() => setEditing(false)} />
      </div>
    );
  }

  const reasonLabel = entry.reason ? REASON_LABEL[entry.reason] : null;

  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          {entry.item} · {entry.quantity} {translateWasteUnit(entry.unit, lang)}
        </p>
        <p className="text-xs text-muted">
          {entry.wasted_date}
          {reasonLabel ? ` · ${lang === "es" ? reasonLabel.es : reasonLabel.en}` : ""}
          {entry.logged_by_name ? ` · ${entry.logged_by_name}` : ""}
        </p>
        {entry.notes && <p className="mt-0.5 text-xs text-muted">{entry.notes}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-accent">
          ✎ {lang === "es" ? "Editar" : "Edit"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const msg = lang === "es" ? "¿Eliminar este registro? Esto no se puede deshacer." : "Delete this entry? This can't be undone.";
            if (!window.confirm(msg)) return;
            setOptimisticallyDeleted(true);
            startTransition(async () => {
              try {
                await deleteWasteEntryAction(entry.id);
              } catch {
                setOptimisticallyDeleted(false);
              }
              router.refresh();
            });
          }}
          className="text-xs font-medium text-critical disabled:opacity-50"
        >
          {lang === "es" ? "Eliminar" : "Delete"}
        </button>
      </div>
    </div>
  );
}
