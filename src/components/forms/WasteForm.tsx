"use client";

import { useState } from "react";
import { quickAddWasteAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, textareaClass, SubmitBar } from "./FormShell";
import DateField from "./DateField";
import { Language } from "@/lib/types";

const UNITS: Array<{ value: string; en: string; es: string }> = [
  { value: "lb", en: "lb", es: "lb" },
  { value: "oz", en: "oz", es: "oz" },
  { value: "each", en: "each", es: "unidad" },
  { value: "case", en: "case", es: "caja" },
  { value: "bag", en: "bag", es: "bolsa" },
  { value: "tray", en: "tray", es: "charola" },
  { value: "gallon", en: "gallon", es: "galón" },
];

const REASONS: Array<{ value: string; en: string; es: string }> = [
  { value: "SPOILED", en: "Spoiled/expired", es: "Dañado/caducado" },
  { value: "OVERPREP", en: "Over-prepped", es: "Sobre-preparado" },
  { value: "DROPPED", en: "Dropped/contaminated", es: "Caído/contaminado" },
  { value: "QUALITY", en: "Quality issue", es: "Problema de calidad" },
  { value: "OTHER", en: "Other", es: "Otro" },
];

export default function WasteForm({ lang, defaultDate }: { lang: Language; defaultDate: string }) {
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "waste",
    quickAddWasteAction,
    (fd) => `${lang === "es" ? "Merma" : "Waste"}: ${fd.get("item")}`
  );

  const total = Number(quantity) > 0 && pricePerUnit !== "" && Number(pricePerUnit) >= 0 ? Number(quantity) * Number(pricePerUnit) : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Artículo" : "Item"}>
        <input name="item" required className={inputClass} placeholder={lang === "es" ? "ej. Arroz, Pollo" : "e.g. Rice, Chicken"} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label={lang === "es" ? "Unidad" : "Unit"}>
          <select name="unit" defaultValue="lb" className={selectClass}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {lang === "es" ? u.es : u.en}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={`${lang === "es" ? "Precio por unidad" : "Price per unit"} (${lang === "es" ? "opcional" : "optional"})`}>
        <input
          name="pricePerUnit"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={pricePerUnit}
          onChange={(e) => setPricePerUnit(e.target.value)}
          className={inputClass}
          placeholder={lang === "es" ? "Déjalo en blanco si no lo sabes" : "Leave blank if you don't know"}
        />
      </Field>
      {total !== null && (
        <p className="text-sm font-semibold text-critical">
          {lang === "es" ? "Total" : "Total"}: ${total.toFixed(2)}
        </p>
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
