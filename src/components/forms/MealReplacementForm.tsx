"use client";

import { quickAddMealReplacementAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, textareaClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function MealReplacementForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    null,
    quickAddMealReplacementAction,
    (fd) => `${lang === "es" ? "Reemplazo de comida" : "Meal replacement"}: ${fd.get("itemDescription")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Canal de contacto" : "Contact channel"}>
        <select name="contactChannel" required defaultValue="IN_STORE" className={selectClass}>
          <option value="PHONE">{lang === "es" ? "Teléfono" : "Phone"}</option>
          <option value="IN_STORE">{lang === "es" ? "En tienda" : "In Store"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Canal del pedido original" : "Original order channel"}>
        <select name="orderChannel" required defaultValue="IN_STORE" className={selectClass}>
          <option value="ONLINE">{lang === "es" ? "En línea" : "Online"}</option>
          <option value="IN_STORE">{lang === "es" ? "En tienda" : "In Store"}</option>
          <option value="DRIVE_THRU">Drive-Thru</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Artículo/comida" : "Item/meal"}>
        <input name="itemDescription" className={inputClass} placeholder={lang === "es" ? "Opcional" : "Optional"} />
      </Field>
      <Field label={lang === "es" ? "Valor aproximado" : "Approx. value"}>
        <input name="valueEstimate" type="number" step="0.01" className={inputClass} placeholder={lang === "es" ? "Opcional" : "Optional"} />
      </Field>
      <Field label={lang === "es" ? "Descripción (opcional)" : "Description (optional)"}>
        <textarea name="description" rows={2} className={textareaClass} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
