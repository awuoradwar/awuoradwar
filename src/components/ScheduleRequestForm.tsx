"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScheduleRequestAction } from "@/app/actions/schedulingActions";
import { Field, inputClass, selectClass, FileField } from "./forms/FormShell";
import DateField from "./forms/DateField";
import { Language } from "@/lib/types";
import { SCHEDULE_REQUEST_TYPE_LABEL } from "@/lib/scheduleRequestLabels";

export default function ScheduleRequestForm({ lang, isGM }: { lang: Language; isGM: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [requestType, setRequestType] = useState("FULL_DAY_OFF");
  // DateField manages its own React state, not a native defaultValue a plain
  // form.reset() can touch -- bumping this key after a successful submit
  // remounts every DateField below fresh, same as the rest of the form
  // clearing back to blank.
  const [resetKey, setResetKey] = useState(0);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createScheduleRequestAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setSaved(true);
          (e.target as HTMLFormElement).reset();
          setRequestType("FULL_DAY_OFF");
          setResetKey((k) => k + 1);
          router.refresh();
          setTimeout(() => setSaved(false), 2000);
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <Field label={lang === "es" ? "Asociado" : "Associate"}>
        <input name="associateName" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Tipo de solicitud" : "Request type"}>
        <select name="requestType" value={requestType} onChange={(e) => setRequestType(e.target.value)} className={selectClass}>
          {Object.entries(SCHEDULE_REQUEST_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {lang === "es" ? label.es : label.en}
            </option>
          ))}
        </select>
      </Field>
      {requestType === "SHIFT_SWAP" && (
        <Field label={lang === "es" ? "Cambiando turno con" : "Swapping shift with"}>
          <input name="swapWithName" required className={inputClass} placeholder={lang === "es" ? "Nombre del otro asociado" : "The other associate's name"} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={requestType === "SHIFT_SWAP" ? (lang === "es" ? "Cede su turno el" : "Giving away their shift on") : lang === "es" ? "Fecha de inicio" : "Start date"}>
          <DateField key={`start-${resetKey}`} name="requestedStartDate" required lang={lang} />
        </Field>
        {requestType === "SHIFT_SWAP" ? (
          <Field label={lang === "es" ? "Toma el turno del otro el" : "Picking up their shift on"}>
            <DateField key={`swap-${resetKey}`} name="swapWithDate" required lang={lang} />
          </Field>
        ) : (
          <Field label={lang === "es" ? "Fecha de fin (opcional)" : "End date (optional)"}>
            <DateField key={`end-${resetKey}`} name="requestedEndDate" lang={lang} />
          </Field>
        )}
      </div>
      {requestType !== "SHIFT_SWAP" && (
        <p className="-mt-1.5 text-xs text-muted">
          {lang === "es"
            ? "Deja la fecha de fin en blanco para un solo día, o pon la última fecha para un rango (p. ej. vacaciones)."
            : "Leave end date blank for a single day, or set the last date for a range (e.g. vacation)."}
        </p>
      )}
      <Field label={lang === "es" ? "Recibido vía" : "Received via"}>
        <select name="receivedVia" defaultValue="TEXT" className={selectClass}>
          <option value="TEXT">{lang === "es" ? "Mensaje de texto" : "Text"}</option>
          <option value="IN_PERSON">{lang === "es" ? "En persona" : "In person"}</option>
          <option value="PHONE">{lang === "es" ? "Teléfono" : "Phone"}</option>
          <option value="WORKJAM_CHAT">WorkJam / Chat</option>
          <option value="OTHER">{lang === "es" ? "Otro" : "Other"}</option>
        </select>
      </Field>
      <Field label={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}>
        <input name="notes" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "Evidencia (opcional)" : "Evidence (optional)"}>
          <FileField name="attachment" accept="image/*,.pdf" lang={lang} />
        </Field>
        <Field label={lang === "es" ? "Tipo" : "Type"}>
          <select name="attachmentType" defaultValue="SCREENSHOT" className={selectClass}>
            <option value="SCREENSHOT">{lang === "es" ? "Captura de pantalla" : "Screenshot"}</option>
            <option value="PHOTO">{lang === "es" ? "Foto" : "Photo"}</option>
            <option value="FILE">{lang === "es" ? "Archivo" : "File"}</option>
          </select>
        </Field>
      </div>
      {isGM && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="gmDecideNow" className="h-5 w-5" />
          {lang === "es" ? "Estoy decidiendo ahora (aprobar de inmediato)" : "I'm deciding now (approve immediately)"}
        </label>
      )}
      {error && <p className="text-sm text-critical">{error}</p>}
      {saved && <p className="text-sm text-ok">{lang === "es" ? "Guardado." : "Saved."}</p>}
      <button type="submit" disabled={pending} className="tap-target rounded-xl bg-accent font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60">
        {pending ? "…" : lang === "es" ? "Registrar solicitud" : "Record request"}
      </button>
    </form>
  );
}
