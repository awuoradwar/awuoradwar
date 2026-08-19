"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateScheduleRequestAction, deleteScheduleRequestAction } from "@/app/actions/schedulingActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import StatusBadge from "./StatusBadge";
import { Language } from "@/lib/types";

interface RequestData {
  id: string;
  associate_name: string;
  request_type: string;
  requested_start_date: string;
  requested_end_date?: string | null;
  requested_start_time?: string | null;
  requested_end_time?: string | null;
  notes?: string | null;
  received_via: string;
  received_by_name: string | null;
  status: string;
  attachment_count?: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  actorName: string | null;
  summary: string | null;
  formattedAt: string;
}

const REQUEST_TYPES = [
  { value: "FULL_DAY_OFF", en: "Full day off", es: "Día completo libre" },
  { value: "LEAVE_EARLY", en: "Leave early", es: "Salir temprano" },
  { value: "LATE_START", en: "Late start", es: "Inicio tardío" },
  { value: "PARTIAL_DAY", en: "Partial day", es: "Día parcial" },
  { value: "TEMP_AVAILABILITY_CHANGE", en: "Temporary availability change", es: "Cambio temporal de disponibilidad" },
  { value: "OTHER", en: "Other", es: "Otro" },
];

export default function ScheduleRequestRow({ request, lang, activity }: { request: RequestData; lang: Language; activity: ActivityEntry[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
  const router = useRouter();

  if (optimisticallyDeleted) return null;

  if (!editing) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {request.associate_name} · {request.request_type.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-muted">
              {request.requested_start_date} · {request.received_via} · {request.received_by_name}
              {request.attachment_count ? (
                <>
                  {" · "}
                  <a href={`/api/schedule-attachments/${request.id}`} target="_blank" rel="noreferrer" className="text-accent underline">
                    📎
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={request.status} lang={lang} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap-target flex shrink-0 items-center gap-1 rounded-full border border-accent px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              ✎ {lang === "es" ? "Editar" : "Edit"}
            </button>
          </div>
        </div>
        {activity.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent">
              {lang === "es" ? "Ver actividad" : "View activity"} ({activity.length})
            </summary>
            <div className="mt-1.5 flex flex-col gap-1 border-l-2 border-border pl-2.5">
              {activity.map((a) => (
                <div key={a.id} className="text-xs text-muted">
                  <p>
                    <span className="font-semibold text-foreground">{a.action}</span> · {a.actorName || (lang === "es" ? "sistema" : "system")} · {a.formattedAt}
                  </p>
                  {a.summary && <p className="text-foreground/80">{a.summary}</p>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateScheduleRequestAction(fd);
          if (result && "error" in result && result.error) {
            setError(result.error);
            return;
          }
          setError(null);
          setEditing(false);
          router.refresh();
        });
      }}
      className="flex flex-col gap-3 p-3"
    >
      <input type="hidden" name="id" value={request.id} />
      <Field label={lang === "es" ? "Asociado" : "Associate"}>
        <input name="associateName" defaultValue={request.associate_name} required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Tipo de solicitud" : "Request type"}>
        <select name="requestType" defaultValue={request.request_type} className={selectClass}>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {lang === "es" ? t.es : t.en}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "Fecha de inicio" : "Start date"}>
          <input name="requestedStartDate" type="date" defaultValue={request.requested_start_date} required className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Fecha de fin (opcional)" : "End date (optional)"}>
          <input name="requestedEndDate" type="date" defaultValue={request.requested_end_date || ""} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={lang === "es" ? "Hora de inicio (opcional)" : "Start time (optional)"}>
          <input name="requestedStartTime" type="time" defaultValue={request.requested_start_time || ""} className={inputClass} />
        </Field>
        <Field label={lang === "es" ? "Hora de fin (opcional)" : "End time (optional)"}>
          <input name="requestedEndTime" type="time" defaultValue={request.requested_end_time || ""} className={inputClass} />
        </Field>
      </div>
      <Field label={lang === "es" ? "Notas (opcional)" : "Notes (optional)"}>
        <input name="notes" defaultValue={request.notes || ""} className={inputClass} />
      </Field>
      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          {lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-sm font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const msg = lang === "es" ? "¿Eliminar esta solicitud? Esto no se puede deshacer." : "Delete this request? This can't be undone.";
            if (!window.confirm(msg)) return;
            setOptimisticallyDeleted(true);
            startTransition(async () => {
              try {
                await deleteScheduleRequestAction(request.id);
              } catch {
                setOptimisticallyDeleted(false);
              }
              router.refresh();
            });
          }}
          className="ml-auto text-sm font-medium text-critical disabled:opacity-50"
        >
          {lang === "es" ? "Eliminar" : "Delete"}
        </button>
      </div>
    </form>
  );
}
