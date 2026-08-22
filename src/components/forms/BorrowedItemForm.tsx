"use client";

import { useState } from "react";
import { quickAddBorrowedItemAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";
import { UNITS_EN, UNITS_ES } from "@/lib/borrowedItemUnits";

export default function BorrowedItemForm({ lang }: { lang: Language }) {
  const [direction, setDirection] = useState<"BORROWED" | "LENT">("BORROWED");
  const [unitChoice, setUnitChoice] = useState("");
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "borrowedItem",
    quickAddBorrowedItemAction,
    (fd) => `${fd.get("direction") === "LENT" ? (lang === "es" ? "Prestado a" : "Lent") : lang === "es" ? "Prestado" : "Borrowed"}: ${fd.get("item")}`
  );
  const units = lang === "es" ? UNITS_ES : UNITS_EN;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="direction" value={direction} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDirection("BORROWED")}
          className={`tap-target rounded-xl border-2 text-sm font-semibold transition-colors ${
            direction === "BORROWED" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
          }`}
        >
          {lang === "es" ? "Prestado de otra tienda" : "Borrowed from another store"}
        </button>
        <button
          type="button"
          onClick={() => setDirection("LENT")}
          className={`tap-target rounded-xl border-2 text-sm font-semibold transition-colors ${
            direction === "LENT" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
          }`}
        >
          {lang === "es" ? "Prestado a otra tienda" : "Lent to another store"}
        </button>
      </div>
      <Field label={direction === "LENT" ? (lang === "es" ? "Prestado a (tienda)" : "Lent to (store)") : lang === "es" ? "Prestado de (tienda)" : "Borrowed from (store)"}>
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
      <Field label={lang === "es" ? "Aprobado por" : "Approved by"}>
        <input name="approvedByName" className={inputClass} placeholder={lang === "es" ? "Quién autorizó esto" : "Who authorized this"} />
      </Field>
      <Field label={lang === "es" ? "Recogido por" : "Picked up by"}>
        <input
          name="pickedUpByName"
          className={inputClass}
          placeholder={direction === "LENT" ? (lang === "es" ? "Quién lo recogió de tu tienda" : "Who picked it up from your store") : lang === "es" ? "Quién lo recogió de la otra tienda" : "Who picked it up from the other store"}
        />
      </Field>
      <Field label={lang === "es" ? "Fecha y hora de recogida" : "Pickup date & time"}>
        <input name="pickedUpAt" type="datetime-local" className={inputClass} />
      </Field>
      <Field label={direction === "LENT" ? (lang === "es" ? "Fecha límite de devolución" : "Due back date & time") : lang === "es" ? "Fecha límite para devolver" : "Due date & time to return"}>
        <input name="dueAt" type="datetime-local" className={inputClass} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
