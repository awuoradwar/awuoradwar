"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceEventAction } from "@/app/actions/attendanceActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

const TYPE_LABEL: Record<string, { en: string; es: string }> = {
  CALL_IN: { en: "Call-in", es: "Aviso de ausencia" },
  LATE: { en: "Late", es: "Tardanza" },
  NO_SHOW: { en: "No Show", es: "No se presentó" },
  LEFT_EARLY: { en: "Left Early", es: "Se fue temprano" },
  SENT_HOME: { en: "Sent Home", es: "Enviado a casa" },
};

export default function AttendanceEditableFields({
  id,
  lang,
  type,
  employeeName,
  eventDate,
  scheduledTime,
  actualTime,
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
  coverageStatus: string | null;
  coveringPerson: string | null;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const typeLabel = TYPE_LABEL[type]?.[lang] || type;
  const hasCoverage = type === "CALL_IN";

  if (!editing) {
    return (
      <>
        <dt className="text-muted">{lang === "es" ? "Empleado" : "Employee"}</dt>
        <dd className="flex items-center justify-between gap-2">
          <span>{employeeName}</span>
          <button type="button" onClick={() => setEditing(true)} className="tap-target flex h-7 w-7 min-h-0 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent">
            ✎
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
        {hasCoverage && coverageStatus && (
          <>
            <dt className="text-muted">{lang === "es" ? "Cobertura" : "Coverage"}</dt>
            <dd>{coverageStatus}</dd>
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
        {hasCoverage && (
          <>
            <Field label={lang === "es" ? "Cobertura" : "Coverage"}>
              <select name="coverageStatus" defaultValue={coverageStatus || "NEEDED"} className={selectClass}>
                <option value="NEEDED">{lang === "es" ? "Necesaria" : "Needed"}</option>
                <option value="FOUND">{lang === "es" ? "Encontrada" : "Found"}</option>
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
