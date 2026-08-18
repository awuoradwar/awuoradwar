"use client";

import { useState } from "react";
import { quickAddBorrowedItemAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

const UNITS_EN = ["case", "sleeve", "bag", "box", "bottle", "bucket", "each"];
const UNITS_ES = ["caja", "manga", "bolsa", "caja chica", "botella", "cubeta", "unidad"];

export default function BorrowedItemForm({ lang }: { lang: Language }) {
  const [unitChoice, setUnitChoice] = useState("");
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "borrowedItem",
    quickAddBorrowedItemAction,
    (fd) => `${lang === "es" ? "Prestado" : "Borrowed"}: ${fd.get("item")}`
  );
  const units = lang === "es" ? UNITS_ES : UNITS_EN;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Prestado de (tienda)" : "Borrowed from (store)"}>
        <input name="borrowedFrom" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Artículo" : "Item"}>
        <input name="item" required className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "Cantidad" : "Quantity"}>
          <input name="quantity" type="number" step="0.01" className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Unidad" : "Unit"}>
          <select
            value={unitChoice}
            onChange={(e) => setUnitChoice(e.target.value)}
            className={selectClass}
          >
            <option value="">{lang === "es" ? "Selecciona" : "Select"}</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value="__other">{lang === "es" ? "Otra..." : "Other..."}</option>
          </select>
          {unitChoice === "__other" ? (
            <input key="other" name="unit" autoFocus className={`${inputClass} mt-2`} placeholder={lang === "es" ? "Escribe la unidad" : "Type a unit"} />
          ) : (
            <input key="picked" type="hidden" name="unit" value={unitChoice} />
          )}
        </Field>
      </div>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
