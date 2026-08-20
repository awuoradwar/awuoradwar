"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceEventAction } from "@/app/actions/attendanceActions";
import { Field, inputClass, selectClass, FileField, btnOutline } from "./forms/FormShell";
import { Language } from "@/lib/types";
import { attendanceTypeLabel, notificationMethodLabel, NOTIFICATION_METHOD_LABEL } from "@/lib/attendanceLabels";

const COVERAGE_LABEL: Record<string, { en: string; es: string }> = {
  NEEDED: { en: "Needed", es: "Necesaria" },
  FOUND: { en: "Found", es: "Encontrada" },
  NOT_FOUND: { en: "Not Found", es: "No Encontrada" },
  NOT_REQUIRED: { en: "Not Required", es: "No Requerida" },
};

export default function AttendanceEditableFields({
  id,
  lang,
  type,
  employeeName,
  eventDate,
  scheduledTime,
  actualTime,
  notifiedAt,
  notificationMethod,
  attachmentRef,
  coverageStatus,
  coveringPerson,
  note,
}: {
  id: string;
  lang: Language;
  type: string;
  employeeName: string;
  eventDate: string | null;
  scheduledTime: string | null;
  actualTime: string | null;
  notifiedAt: string | null;
  notificationMethod: string | null;
  attachmentRef: string | null;
  coverageStatus: string | null;
  coveringPerson: string | null;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const typeLabel = attendanceTypeLabel(type, lang);
  const hasCoverage = type === "CALL_IN";
  const hasNotification = type === "CALL_IN" || type === "LATE";

  if (!editing) {
    return (
      <>
        <dt className="text-muted">{lang === "es" ? "Empleado" : "Employee"}</dt>
        <dd className="flex items-center justify-between gap-2">
          <span>{employeeName}</span>
          <button type="button" onClick={() => setEditing(true)} className={`shrink-0 gap-1.5 ${btnOutline}`}>
            ✎ {lang === "es" ? "Editar" : "Edit"}
          </button>
        </dd>
        <dt className="text-muted">{lang === "es" ? "Tipo" : "Type"}</dt>
        <dd>{typeLabel}</dd>
        {eventDate && (
          <>
            <dt className="text-muted">{lang === "es" ? "Fecha" : "Date"}</dt>
            <dd>{eventDate}</dd>
          </>
        )}
        {scheduledTime && (
          <>
            <dt className="text-muted">{lang === "es" ? "Hora programada" : "Scheduled time"}</dt>
            <dd>{scheduledTime}</dd>
          </>
        )}
        {hasNotification && notifiedAt && (
          <>
            <dt className="text-muted">{lang === "es" ? "Hora en que avisó" : "Time notified"}</dt>
            <dd>{notifiedAt}</dd>
          </>
        )}
        {hasNotification && notificationMethod && (
          <>
            <dt className="text-muted">{lang === "es" ? "Cómo avisó" : "How communicated"}</dt>
            <dd>{notificationMethodLabel(notificationMethod, lang)}</dd>
          </>
        )}
        {hasCoverage && coverageStatus && (
          <>
            <dt className="text-muted">{lang === "es" ? "Cobertura" : "Coverage"}</dt>
            <dd>{COVERAGE_LABEL[coverageStatus]?.[lang] || coverageStatus}</dd>
          </>
        )}
        {hasCoverage && coveringPerson && (
          <>
            <dt className="text-muted">{lang === "es" ? "Cubre" : "Covering person"}</dt>
            <dd>{coveringPerson}</dd>
          </>
        )}
        {note && (
          <>
            <dt className="text-muted">{lang === "es" ? "Nota" : "Note"}</dt>
            <dd>{note}</dd>
          </>
        )}
        {hasNotification && attachmentRef && (
          <>
            <dt className="text-muted">{lang === "es" ? "Captura de pantalla" : "Screenshot"}</dt>
            <dd>
              <a href={`/api/attendance-attachments/${id}`} target="_blank" rel="noreferrer" className="text-accent underline">
                {lang === "es" ? "Ver" : "View"}
              </a>
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
            const result = await updateAttendanceEventAction(fd);
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
        <Field label={lang === "es" ? "Empleado" : "Employee"}>
          <input name="employeeName" defaultValue={employeeName} required className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Fecha" : "Date"}>
          <input name="eventDate" type="date" defaultValue={eventDate || ""} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Hora programada" : "Scheduled time"}>
          <input name="scheduledTime" type="time" defaultValue={scheduledTime || ""} className={inputClass} />
        </Field>
        {type === "LATE" && (
          <Field label={lang === "es" ? "Hora real" : "Actual time"}>
            <input name="actualTime" type="time" defaultValue={actualTime || ""} className={inputClass} />
          </Field>
        )}
        {hasNotification && (
          <>
            <Field label={lang === "es" ? "Hora en que avisó" : "Time notified"}>
              <input name="notifiedAt" type="time" defaultValue={notifiedAt || ""} className={inputClass} />
            </Field>
            <Field label={lang === "es" ? "Cómo avisó" : "How communicated"}>
              <select name="notificationMethod" defaultValue={notificationMethod || ""} className={selectClass}>
                <option value="">{lang === "es" ? "Selecciona" : "Select"}</option>
                {Object.entries(NOTIFICATION_METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {lang === "es" ? label.es : label.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={lang === "es" ? "Captura de pantalla" : "Screenshot"}>
              <FileField name="attachment" accept="image/*" lang={lang} />
              {attachmentRef && <p className="mt-1 text-xs text-muted">{lang === "es" ? "Deja en blanco para conservar la actual." : "Leave blank to keep the current one."}</p>}
            </Field>
          </>
        )}
        {hasCoverage && (
          <>
            <Field label={lang === "es" ? "Cobertura" : "Coverage"}>
              <select name="coverageStatus" defaultValue={coverageStatus || "NEEDED"} className={selectClass}>
                <option value="NEEDED">{lang === "es" ? "Necesaria" : "Needed"}</option>
                <option value="FOUND">{lang === "es" ? "Encontrada" : "Found"}</option>
                <option value="NOT_FOUND">{lang === "es" ? "No Encontrada" : "Not Found"}</option>
                <option value="NOT_REQUIRED">{lang === "es" ? "No requerida" : "Not required"}</option>
              </select>
            </Field>
            <Field label={lang === "es" ? "Cubre" : "Covering person"}>
              <input name="coveringPerson" defaultValue={coveringPerson || ""} className={inputClass} />
            </Field>
          </>
        )}
        <Field label={lang === "es" ? "Nota" : "Note"}>
          <input name="note" defaultValue={note || ""} className={inputClass} />
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
