"use client";

import { quickAddCateringAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, selectClass, textareaClass, SubmitBar } from "./FormShell";
import DateField from "./DateField";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function CateringForm({ lang, defaultDueDate }: { lang: Language; defaultDueDate: string }) {
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    "catering",
    quickAddCateringAction,
    (fd) => `${lang === "es" ? "Catering" : "Catering"}: ${fd.get("numberOfPeople") || "?"} ${lang === "es" ? "personas" : "people"}`
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label={t(lang, "field_due_date")}>
        <DateField name="dueDate" required defaultValue={defaultDueDate} lang={lang} />
      </Field>
      <Field label={`${t(lang, "field_pickup_time")} (${lang === "es" ? "opcional" : "optional"})`}>
        <input name="pickupTime" type="time" className={inputClass} />
      </Field>
      <Field label={t(lang, "field_number_of_people")}>
        <input name="numberOfPeople" type="number" min="1" step="1" inputMode="numeric" required className={inputClass} />
      </Field>
      <Field label={t(lang, "field_channel")}>
        <select name="channel" required defaultValue="PHONE" className={selectClass}>
          <option value="OLO">OLO ({lang === "es" ? "pedido en línea" : "online ordering"})</option>
          <option value="EZCATERING">EZCater</option>
          <option value="IN_STORE">{lang === "es" ? "En Tienda" : "In-Store"}</option>
          <option value="PHONE">{lang === "es" ? "Teléfono" : "Phone"}</option>
        </select>
      </Field>
      <Field label={`${t(lang, "field_customer_name")} (${lang === "es" ? "opcional" : "optional"})`}>
        <input name="customerName" className={inputClass} />
      </Field>
      <Field label={`${t(lang, "field_notes")} (${lang === "es" ? "opcional" : "optional"})`}>
        <textarea name="notes" rows={2} className={textareaClass} placeholder={lang === "es" ? "Artículos especiales, alérgenos, instrucciones de entrega..." : "Special items, allergens, delivery instructions..."} />
      </Field>
      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
