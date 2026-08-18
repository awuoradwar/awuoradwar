"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBorrowedItemAction } from "@/app/actions/operationsActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const UNITS_EN = ["case", "sleeve", "bag", "box", "bottle", "bucket", "each"];
const UNITS_ES = ["caja", "manga", "bolsa", "caja chica", "botella", "cubeta", "unidad"];

export default function BorrowedItemEditableFields({
  id,
  lang,
  borrowedFrom,
  item,
  quantity,
  unit,
}: {
  id: string;
  lang: Language;
  borrowedFrom: string;
  item: string;
  quantity: number | null;
  unit: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [unitChoice, setUnitChoice] = useState(unit && !UNITS_EN.includes(unit) && !UNITS_ES.includes(unit) ? "__other" : unit || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const units = lang === "es" ? UNITS_ES : UNITS_EN;

  if (!editing) {
    return (
      <>
        <dt className="text-muted">{t(lang, "field_borrowed_from")}</dt>
        <dd className="flex items-center justify-between gap-2">
          <span>{borrowedFrom}</span>
          <button type="button" onClick={() => setEditing(true)} className="tap-target flex h-7 w-7 min-h-0 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent">
            ✎
          </button>
        </dd>
        <dt className="text-muted">{lang === "es" ? "Artículo" : "Item"}</dt>
        <dd>{item}</dd>
        {quantity != null && (
          <>
            <dt className="text-muted">{t(lang, "field_quantity")}</dt>
            <dd>
              {quantity} {unit || ""}
            </dd>
          </>
        )}
      </>
    );
  }

  return (
    <dd className="col-span-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const result = await updateBorrowedItemAction(fd);
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            setError(null);
            setEditing(false);
            router.refresh();
          });
        }}
        className="flex flex-col gap-3 rounded-xl border border-border p-3"
      >
        <input type="hidden" name="id" value={id} />
        <Field label={lang === "es" ? "Prestado de (tienda)" : "Borrowed from (store)"}>
          <input name="borrowedFrom" defaultValue={borrowedFrom} required className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Artículo" : "Item"}>
          <input name="item" defaultValue={item} required className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={lang === "es" ? "Cantidad" : "Quantity"}>
            <input name="quantity" type="number" step="0.01" defaultValue={quantity ?? ""} className={inputClass} />
          </Field>
          <Field label={lang === "es" ? "Unidad" : "Unit"}>
            <select value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)} className={selectClass}>
              <option value="">{lang === "es" ? "Selecciona" : "Select"}</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              <option value="__other">{lang === "es" ? "Otra..." : "Other..."}</option>
            </select>
            {unitChoice === "__other" ? (
              <input key="other" name="unit" defaultValue={unit || ""} autoFocus className={`${inputClass} mt-2`} placeholder={lang === "es" ? "Escribe la unidad" : "Type a unit"} />
            ) : (
              <input key="picked" type="hidden" name="unit" value={unitChoice} />
            )}
          </Field>
        </div>
        {error && <p className="text-sm text-critical">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50">
            {lang === "es" ? "Guardar" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-sm font-medium text-muted">
            {lang === "es" ? "Cancelar" : "Cancel"}
          </button>
        </div>
      </form>
    </dd>
  );
}
