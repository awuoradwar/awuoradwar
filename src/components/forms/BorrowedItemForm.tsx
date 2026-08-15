"use client";

import { quickAddBorrowedItemAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function BorrowedItemForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "borrowedItem",
    quickAddBorrowedItemAction,
    (fd) => `${lang === "es" ? "Prestado" : "Borrowed"}: ${fd.get("item")}`
  );

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
          <input name="unit" className={inputClass} placeholder="case" />
        </Field>
      </div>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
