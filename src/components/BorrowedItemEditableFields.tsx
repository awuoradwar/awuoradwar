"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBorrowedItemAction } from "@/app/actions/operationsActions";
import { Field, inputClass, selectClass, btnOutline } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { UNITS_EN, UNITS_ES, translateUnit } from "@/lib/borrowedItemUnits";

/** pickedUpAtLocal is already the store's own wall-clock time ("YYYY-MM-
 * DDTHH:MM") -- handing it to `new Date(...)` would have the *viewer's*
 * browser reinterpret those numbers in its own timezone, which is wrong
 * whenever they differ. Format the parsed numbers directly instead. */
function formatStoreLocal(localDateTime: string, lang: Language): string {
  const [datePart, timePart] = localDateTime.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi)).toLocaleString(lang === "es" ? "es-MX" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

/** Overdue -> critical (red), due within 24h -> warning (amber), otherwise
 * plain -- same "escalate as it approaches" idea used for CRITICAL tasks
 * elsewhere, applied here since a borrowed/lent item has no other signal
 * that it needs attention until someone happens to open it. Takes the real
 * UTC instant (not the store-local display string) so the comparison
 * against the browser's own clock is a plain, always-correct instant diff. */
function dueTone(dueAtIso: string): "critical" | "warning" | null {
  const hoursUntil = (new Date(dueAtIso).getTime() - Date.now()) / 3600000;
  if (hoursUntil < 0) return "critical";
  if (hoursUntil <= 24) return "warning";
  return null;
}

export default function BorrowedItemEditableFields({
  id,
  lang,
  direction,
  borrowedFrom,
  item,
  quantity,
  unit,
  approvedByName,
  pickedUpByName,
  pickedUpAtLocal,
  dueAtLocal,
  dueAtIso,
}: {
  id: string;
  lang: Language;
  direction: "BORROWED" | "LENT";
  borrowedFrom: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  approvedByName: string | null;
  pickedUpByName: string | null;
  pickedUpAtLocal: string | null;
  dueAtLocal: string | null;
  dueAtIso: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editDirection, setEditDirection] = useState<"BORROWED" | "LENT">(direction);
  const units = lang === "es" ? UNITS_ES : UNITS_EN;
  // The stored unit might have been picked in the other language (e.g.
  // "caja" saved by a Spanish-language manager) -- translate it into this
  // viewer's language first so the dropdown below actually finds it among
  // `units` instead of falling through to "__other".
  const displayUnit = translateUnit(unit, lang);
  const [unitChoice, setUnitChoice] = useState(displayUnit && !units.includes(displayUnit) ? "__other" : displayUnit || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!editing) {
    const storeFieldLabel =
      direction === "LENT" ? (lang === "es" ? "Prestado a" : "Lent to") : lang === "es" ? "Prestado de" : "Borrowed from";
    const tone = dueAtIso ? dueTone(dueAtIso) : null;
    const dueLabel = direction === "LENT" ? (lang === "es" ? "Fecha límite de devolución" : "Due back") : lang === "es" ? "Fecha límite para devolver" : "Due";
    return (
      <>
        <dt className="text-muted">{storeFieldLabel}</dt>
        <dd className="flex items-center justify-between gap-2">
          <span>{borrowedFrom}</span>
          <button type="button" onClick={() => setEditing(true)} className={`shrink-0 gap-1.5 ${btnOutline}`}>
            ✎ {lang === "es" ? "Editar" : "Edit"}
          </button>
        </dd>
        <dt className="text-muted">{lang === "es" ? "Artículo" : "Item"}</dt>
        <dd>{item}</dd>
        {quantity != null && (
          <>
            <dt className="text-muted">{t(lang, "field_quantity")}</dt>
            <dd>
              {quantity} {displayUnit || ""}
            </dd>
          </>
        )}
        {approvedByName && (
          <>
            <dt className="text-muted">{lang === "es" ? "Aprobado por" : "Approved by"}</dt>
            <dd>{approvedByName}</dd>
          </>
        )}
        {pickedUpByName && (
          <>
            <dt className="text-muted">{lang === "es" ? "Recogido por" : "Picked up by"}</dt>
            <dd>{pickedUpByName}</dd>
          </>
        )}
        {pickedUpAtLocal && (
          <>
            <dt className="text-muted">{lang === "es" ? "Fecha y hora de recogida" : "Pickup date & time"}</dt>
            <dd>{formatStoreLocal(pickedUpAtLocal, lang)}</dd>
          </>
        )}
        {dueAtLocal && (
          <>
            <dt className={tone === "critical" ? "font-semibold text-critical" : tone === "warning" ? "font-semibold text-warning" : "text-muted"}>
              {dueLabel}
            </dt>
            <dd className={tone === "critical" ? "font-semibold text-critical" : tone === "warning" ? "font-semibold text-warning" : undefined}>
              {tone === "critical" ? "⚠ " : ""}
              {formatStoreLocal(dueAtLocal, lang)}
              {tone === "critical" ? (lang === "es" ? " · Vencido" : " · Overdue") : ""}
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
        <input type="hidden" name="direction" value={editDirection} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setEditDirection("BORROWED")}
            className={`tap-target rounded-xl border-2 text-sm font-semibold transition-colors ${
              editDirection === "BORROWED" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            {lang === "es" ? "Prestado de otra tienda" : "Borrowed from another store"}
          </button>
          <button
            type="button"
            onClick={() => setEditDirection("LENT")}
            className={`tap-target rounded-xl border-2 text-sm font-semibold transition-colors ${
              editDirection === "LENT" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            {lang === "es" ? "Prestado a otra tienda" : "Lent to another store"}
          </button>
        </div>
        <Field label={editDirection === "LENT" ? (lang === "es" ? "Prestado a (tienda)" : "Lent to (store)") : lang === "es" ? "Prestado de (tienda)" : "Borrowed from (store)"}>
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
              <input key="other" name="unit" defaultValue={displayUnit || ""} autoFocus className={`${inputClass} mt-2`} placeholder={lang === "es" ? "Escribe la unidad" : "Type a unit"} />
            ) : (
              <input key="picked" type="hidden" name="unit" value={unitChoice} />
            )}
          </Field>
        </div>
        <Field label={lang === "es" ? "Aprobado por" : "Approved by"}>
          <input name="approvedByName" defaultValue={approvedByName || ""} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Recogido por" : "Picked up by"}>
          <input name="pickedUpByName" defaultValue={pickedUpByName || ""} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Fecha y hora de recogida" : "Pickup date & time"}>
          <input name="pickedUpAt" type="datetime-local" defaultValue={pickedUpAtLocal || ""} className={inputClass} />
        </Field>
        <Field label={editDirection === "LENT" ? (lang === "es" ? "Fecha límite de devolución" : "Due back date & time") : lang === "es" ? "Fecha límite para devolver" : "Due date & time to return"}>
          <input name="dueAt" type="datetime-local" defaultValue={dueAtLocal || ""} className={inputClass} />
        </Field>
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
