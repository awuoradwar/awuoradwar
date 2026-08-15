"use client";

import { quickAddGuestRecoveryAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, selectClass, textareaClass, SubmitBar } from "./FormShell";
import { Language } from "@/lib/types";

export default function GuestRecoveryForm({ lang }: { lang: Language }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "guestRecovery",
    quickAddGuestRecoveryAction,
    (fd) => `${lang === "es" ? "Recuperación de cliente" : "Guest recovery"}: ${fd.get("issueCategory")}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={lang === "es" ? "Canal de contacto" : "Contact channel"}>
        <select name="contactChannel" required defaultValue="PHONE" className={selectClass}>
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
      <Field label={lang === "es" ? "Categoría" : "Issue category"}>
        <select name="issueCategory" defaultValue="FOOD_QUALITY" className={selectClass}>
          <option value="FOOD_QUALITY">{lang === "es" ? "Calidad de comida" : "Food quality"}</option>
          <option value="ACCURACY">{lang === "es" ? "Precisión" : "Accuracy"}</option>
          <option value="SERVICE">{lang === "es" ? "Servicio" : "Service"}</option>
          <option value="CLEANLINESS">{lang === "es" ? "Limpieza" : "Cleanliness"}</option>
          <option value="OTHER">{lang === "es" ? "Otro" : "Other"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Descripción (opcional)" : "Description (optional)"}>
        <textarea name="description" rows={2} className={textareaClass} />
      </Field>
      <p className="text-xs text-muted">
        {lang === "es"
          ? "El estado inicia como Pendiente. Un gerente autorizado puede aprobar el reemplazo después."
          : "Starts as Pending. An authorized manager can approve a replacement later."}
      </p>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
