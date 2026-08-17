"use client";

import { quickAddMealReplacementAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, textareaClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function MealReplacementForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "guestRecovery",
    quickAddMealReplacementAction,
    (fd) => `${lang === "es" ? "Recuperación de cliente" : "Guest recovery"}: ${fd.get("issueCategory")}`
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
      <Field label={lang === "es" ? "Categoría" : "Category"}>
        <select name="issueCategory" defaultValue="FOOD_QUALITY" className={selectClass}>
          <option value="FOOD_QUALITY">{lang === "es" ? "Calidad de comida" : "Food quality"}</option>
          <option value="ACCURACY">{lang === "es" ? "Precisión" : "Accuracy"}</option>
          <option value="SERVICE">{lang === "es" ? "Servicio" : "Service"}</option>
          <option value="CLEANLINESS">{lang === "es" ? "Limpieza" : "Cleanliness"}</option>
          <option value="OTHER">{lang === "es" ? "Otro" : "Other"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Nombre del cliente" : "Guest name"}>
        <input
          name="guestName"
          className={inputClass}
          placeholder={lang === "es" ? "Opcional -- ayuda a identificar repeticiones" : "Optional -- helps spot repeat requests"}
        />
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
      <p className="text-xs text-muted">
        {lang === "es"
          ? "Cualquier gerente puede completarlo cuando el cliente llegue -- usted mismo u otro gerente."
          : "Any manager can complete it once the guest arrives -- you or someone else on shift."}
      </p>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
