"use client";

import { useState } from "react";
import { quickAddWasteAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, textareaClass, SubmitBar } from "./FormShell";
import DateField from "./DateField";
import { Language } from "@/lib/types";
import { UNITS_EN, UNITS_ES, BATCH_SIZES } from "@/lib/wasteUnits";

const REASONS: Array<{ value: string; en: string; es: string }> = [
  { value: "SPOILED", en: "Spoiled/expired", es: "Dañado/caducado" },
  { value: "OVERPREP", en: "Over-prepped", es: "Sobre-preparado" },
  { value: "DROPPED", en: "Dropped/contaminated", es: "Caído/contaminado" },
  { value: "QUALITY", en: "Quality issue", es: "Problema de calidad" },
  { value: "OTHER", en: "Other", es: "Otro" },
];

export default function WasteForm({ lang, defaultDate }: { lang: Language; defaultDate: string }) {
  const units = lang === "es" ? UNITS_ES : UNITS_EN;
  const [measureBy, setMeasureBy] = useState<"unit" | "batch">("unit");
  const [batchIndex, setBatchIndex] = useState(0);
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "waste",
    quickAddWasteAction,
    (fd) => `${lang === "es" ? "Merma" : "Waste"}: ${fd.get("item")}`,
    "/more/waste"
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Artículo" : "Item"}>
        <input name="item" required className={inputClass} placeholder={lang === "es" ? "ej. Arroz, Pollo" : "e.g. Rice, Chicken"} />
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
      {measureBy === "unit" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={lang === "es" ? "Cantidad" : "Quantity"}>
            <input name="quantity" type="number" step="any" min="0" inputMode="decimal" required className={inputClass} />
          </Field>
          <Field label={lang === "es" ? "Unidad" : "Unit"}>
            <select name="unit" defaultValue={units[0]} className={selectClass}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <Field label={lang === "es" ? "Tamaño de la tanda" : "Batch size"}>
          <select value={batchIndex} onChange={(e) => setBatchIndex(Number(e.target.value))} className={selectClass}>
            {BATCH_SIZES.map((b, i) => (
              <option key={i} value={i}>
                {lang === "es" ? b.labelEs : b.labelEn}
              </option>
            ))}
          </select>
          <input type="hidden" name="quantity" value={BATCH_SIZES[batchIndex].quantity} />
          <input type="hidden" name="unit" value={BATCH_SIZES[batchIndex].unit} />
        </Field>
      )}
      <Field label={lang === "es" ? "Motivo (opcional)" : "Reason (optional)"}>
        <select name="reason" defaultValue="" className={selectClass}>
          <option value="">{lang === "es" ? "Sin especificar" : "Unspecified"}</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {lang === "es" ? r.es : r.en}
            </option>
          ))}
        </select>
      </Field>
      <Field label={lang === "es" ? "Fecha" : "Date"}>
        <DateField name="wastedDate" required defaultValue={defaultDate} lang={lang} />
      </Field>
      <Field label={`${lang === "es" ? "Notas" : "Notes"} (${lang === "es" ? "opcional" : "optional"})`}>
        <textarea name="notes" rows={2} className={textareaClass} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
