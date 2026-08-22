"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateScheduleRequestAction, deleteScheduleRequestAction } from "@/app/actions/schedulingActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import StatusBadge from "./StatusBadge";
import AttachmentViewerLink from "./AttachmentViewerLink";
import { Language } from "@/lib/types";
import { SCHEDULE_REQUEST_TYPE_LABEL, scheduleRequestTypeLabel } from "@/lib/scheduleRequestLabels";

interface RequestData {
  id: string;
  associate_name: string;
  request_type: string;
  requested_start_date: string;
  requested_end_date?: string | null;
  requested_start_time?: string | null;
  requested_end_time?: string | null;
  swap_with_name?: string | null;
  swap_with_date?: string | null;
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

export default function ScheduleRequestRow({ request, lang, activity }: { request: RequestData; lang: Language; activity: ActivityEntry[] }) {
  const [editing, setEditing] = useState(false);
  const [editRequestType, setEditRequestType] = useState(request.request_type);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
  const router = useRouter();

  if (optimisticallyDeleted) return null;

  if (!editing) {
    return (
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-semibold text-foreground">{request.associate_name}</p>
              <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                {scheduleRequestTypeLabel(request.request_type, lang)}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {request.requested_start_date}
              {request.requested_end_date && request.requested_end_date !== request.requested_start_date ? ` – ${request.requested_end_date}` : ""}
              {request.swap_with_name ? ` ↔ ${request.swap_with_name}` : ""}
              {request.swap_with_date ? ` (${request.swap_with_date})` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {request.received_via} · {request.received_by_name}
              {request.attachment_count ? " · 📎" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={request.status} lang={lang} />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
              }}
              className="h-9 min-h-0 inline-flex shrink-0 items-center gap-1 rounded-full border border-accent px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              ✎ {lang === "es" ? "Editar" : "Edit"}
            </button>
          </div>
        </summary>
        <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2 text-xs">
          {(request.requested_start_time || request.requested_end_time) && (
            <p>
              <span className="font-semibold text-foreground">{lang === "es" ? "Horario: " : "Time: "}</span>
              <span className="text-muted">
                {request.requested_start_time || "?"}
                {request.requested_end_time ? ` – ${request.requested_end_time}` : ""}
              </span>
            </p>
          )}
          {request.notes && (
            <p className="text-foreground">
              <span className="font-semibold">{lang === "es" ? "Notas: " : "Notes: "}</span>
              {request.notes}
            </p>
          )}
          {!!request.attachment_count && (
            <p>
              <AttachmentViewerLink
                href={`/api/schedule-attachments/${request.id}`}
                label={`📎 ${lang === "es" ? "Ver evidencia" : "View evidence"}`}
                lang={lang}
                className="font-semibold text-accent underline"
              />
            </p>
          )}
          {activity.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5 border-l-2 border-border pl-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {lang === "es" ? "Actividad" : "Activity"} ({activity.length})
              </p>
              {activity.map((a) => (
                <div key={a.id} className="text-xs text-muted">
                  <p>
                    <span className="font-semibold text-foreground">{a.action}</span> · {a.actorName || (lang === "es" ? "sistema" : "system")} · {a.formattedAt}
                  </p>
                  {a.summary && <p className="text-foreground/80">{a.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
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
        <select name="requestType" value={editRequestType} onChange={(e) => setEditRequestType(e.target.value)} className={selectClass}>
          {Object.entries(SCHEDULE_REQUEST_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {lang === "es" ? label.es : label.en}
            </option>
          ))}
        </select>
      </Field>
      {editRequestType === "SHIFT_SWAP" && (
        <Field label={lang === "es" ? "Cambiando turno con" : "Swapping shift with"}>
          <input name="swapWithName" defaultValue={request.swap_with_name || ""} required className={inputClass} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={editRequestType === "SHIFT_SWAP" ? (lang === "es" ? "Cede su turno el" : "Giving away their shift on") : lang === "es" ? "Fecha de inicio" : "Start date"}>
          <input name="requestedStartDate" type="date" defaultValue={request.requested_start_date} required className={inputClass} />
        </Field>
        {editRequestType === "SHIFT_SWAP" ? (
          <Field label={lang === "es" ? "Toma el turno del otro el" : "Picking up their shift on"}>
            <input name="swapWithDate" type="date" defaultValue={request.swap_with_date || ""} required className={inputClass} />
          </Field>
        ) : (
          <Field label={lang === "es" ? "Fecha de fin (opcional)" : "End date (optional)"}>
            <input name="requestedEndDate" type="date" defaultValue={request.requested_end_date || ""} className={inputClass} />
          </Field>
        )}
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
