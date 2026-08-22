"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideRequestAction } from "@/app/actions/schedulingActions";
import AttachmentViewerLink from "./AttachmentViewerLink";
import { Language } from "@/lib/types";

interface RequestRow {
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
  attachment_count?: number;
}

export default function ApprovalQueueRow({ request, lang }: { request: RequestRow; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDecided, setOptimisticallyDecided] = useState(false);
  const router = useRouter();

  function decide(decision: "APPROVED" | "DENIED") {
    setOptimisticallyDecided(true);
    startTransition(async () => {
      try {
        await decideRequestAction(request.id, decision);
      } catch {
        setOptimisticallyDecided(false);
      }
      router.refresh();
    });
  }

  if (optimisticallyDecided) return null;

  return (
    <div className="card p-3">
      <p className="text-sm font-semibold">
        {request.associate_name} · {request.request_type.replace(/_/g, " ")}
        {request.swap_with_name ? ` ↔ ${request.swap_with_name}` : ""}
      </p>
      <p className="text-xs text-muted">
        {request.requested_start_date}
        {request.requested_end_date ? ` – ${request.requested_end_date}` : ""}
        {request.swap_with_date ? ` ↔ ${request.swap_with_date}` : ""} · {request.received_via} · {lang === "es" ? "recibido por" : "received by"} {request.received_by_name}
      </p>
      {(request.requested_start_time || request.requested_end_time) && (
        <p className="text-xs text-muted">
          {lang === "es" ? "Horario: " : "Time: "}
          {request.requested_start_time || "?"}
          {request.requested_end_time ? ` – ${request.requested_end_time}` : ""}
        </p>
      )}
      {request.notes && (
        <p className="mt-1 text-xs text-foreground">
          <span className="font-semibold">{lang === "es" ? "Notas: " : "Notes: "}</span>
          {request.notes}
        </p>
      )}
      {!!request.attachment_count && (
        <p className="mt-1 text-xs">
          <AttachmentViewerLink
            href={`/api/schedule-attachments/${request.id}`}
            label={`📎 ${lang === "es" ? "Ver evidencia" : "View evidence"}`}
            lang={lang}
            className="font-semibold text-accent underline"
          />
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button disabled={pending} onClick={() => decide("APPROVED")} className="h-9 min-h-0 inline-flex flex-1 items-center justify-center rounded-full bg-ok/10 px-3 text-xs font-semibold text-ok disabled:opacity-50">
          {lang === "es" ? "Aprobar" : "Approve"}
        </button>
        <button disabled={pending} onClick={() => decide("DENIED")} className="h-9 min-h-0 inline-flex flex-1 items-center justify-center rounded-full bg-critical/10 px-3 text-xs font-semibold text-critical disabled:opacity-50">
          {lang === "es" ? "Denegar" : "Deny"}
        </button>
      </div>
    </div>
  );
}
