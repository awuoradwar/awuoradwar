"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWasteEntryAction, updateWasteEntryAction } from "@/app/actions/operationsActions";
import { Field, inputClass, selectClass, textareaClass } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";
import { WasteLogEntry } from "@/lib/services/wasteService";
import { UNITS_EN, UNITS_ES, BATCH_SIZES, translateWasteUnit } from "@/lib/wasteUnits";

const REASON_LABEL: Record<string, { en: string; es: string }> = {
  SPOILED: { en: "Spoiled/expired", es: "Dañado/caducado" },
  OVERPREP: { en: "Over-prepped", es: "Sobre-preparado" },
  UNDERPREP: { en: "Under-prepped", es: "Sub-preparado" },
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
  // An existing entry's batch/party-tray unit may have been saved in
  // whichever language it was logged in -- normalize to English before
  // matching it against BATCH_SIZES, which is keyed in English.
  const normalizedUnit = translateWasteUnit(entry.unit, "en") || entry.unit;
  const isBatchUnit = normalizedUnit === "batch" || normalizedUnit === "party tray";
  const [measureBy, setMeasureBy] = useState<"unit" | "batch">(isBatchUnit ? "batch" : "unit");
  // Shared across both modes so a "#2" tap can fill Quantity in directly --
  // Quantity itself stays a normal, separately editable field either way.
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [batchUnit, setBatchUnit] = useState<string>(isBatchUnit ? normalizedUnit : "batch");

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
        <button
          type="button"
          onClick={() => setMeasureBy("unit")}
          className={`tap-target rounded-xl border-2 text-sm font-semibold transition-colors ${
            measureBy === "unit" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
          }`}
        >
          {lang === "es" ? "Unidad" : "Unit"}
        </button>
        <button
          type="button"
          onClick={() => setMeasureBy("batch")}
          className={`tap-target rounded-xl border-2 text-sm font-semibold transition-colors ${
            measureBy === "batch" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
          }`}
        >
          {lang === "es" ? "Tanda de cocina" : "Cooking Batch"}
        </button>
      </div>
      {measureBy === "batch" && (
        <div className="flex flex-wrap gap-1.5">
          {BATCH_SIZES.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuantity(String(p.quantity));
                setBatchUnit(p.unit);
              }}
              className="rounded-full border border-accent/30 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
            >
              {lang === "es" ? p.labelEs : p.labelEn}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={lang === "es" ? "Cantidad" : "Quantity"}>
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </Field>
        {measureBy === "unit" ? (
          <Field label={lang === "es" ? "Unidad" : "Unit"}>
            <select name="unit" defaultValue={isBatchUnit ? units[0] : displayUnit} className={selectClass}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={lang === "es" ? "Unidad de tanda" : "Batch unit"}>
            <select name="unit" value={batchUnit} onChange={(e) => setBatchUnit(e.target.value)} className={selectClass}>
              <option value="batch">{lang === "es" ? "Tanda" : "Batch"}</option>
              <option value="party tray">{lang === "es" ? "Charola grande" : "Party Tray"}</option>
            </select>
          </Field>
        )}
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
  // Delete used to sit right under Edit in the same cramped corner -- one
  // careless tap away from an unrecoverable delete. Now it only appears
  // after tapping the row open, a deliberate extra step Edit doesn't need.
  const [expanded, setExpanded] = useState(false);
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
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium text-foreground">
            {entry.item} · {entry.quantity} {translateWasteUnit(entry.unit, lang)}
          </p>
          <p className="text-xs text-muted">
            {entry.wasted_date}
            {reasonLabel ? ` · ${lang === "es" ? reasonLabel.es : reasonLabel.en}` : ""}
            {entry.logged_by_name ? ` · ${entry.logged_by_name}` : ""}
          </p>
          {entry.notes && <p className="mt-0.5 text-xs text-muted">{entry.notes}</p>}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-accent">
          ✎ {lang === "es" ? "Editar" : "Edit"}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
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
            className="tap-target w-full rounded-lg border border-critical/30 text-sm font-medium text-critical disabled:opacity-50"
          >
            {lang === "es" ? "Eliminar registro" : "Delete entry"}
          </button>
        </div>
      )}
    </div>
  );
}
