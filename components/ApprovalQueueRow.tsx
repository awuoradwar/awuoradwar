"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideRequestAction } from "@/app/actions/schedulingActions";
import { Language } from "@/lib/types";

interface RequestRow {
  id: string;
  associate_name: string;
  request_type: string;
  requested_start_date: string;
  received_via: string;
  received_by_name: string | null;
  attachment_count?: number;
}

export default function ApprovalQueueRow({ request, lang }: { request: RequestRow; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "APPROVED" | "DENIED") {
    startTransition(async () => {
      await decideRequestAction(request.id, decision);
      router.refresh();
    });
  }

  return (
    <div className="card p-3">
      <p className="text-sm font-semibold">{request.associate_name} · {request.request_type.replace(/_/g, " ")}</p>
      <p className="text-xs text-muted">
        {request.requested_start_date} · {request.received_via} · {lang === "es" ? "recibido por" : "received by"} {request.received_by_name}
        {request.attachment_count ? (
          <>
            {" · "}
            <a href={`/api/schedule-attachments/${request.id}`} target="_blank" rel="noreferrer" className="text-accent underline">
              📎 {lang === "es" ? "Ver evidencia" : "View evidence"}
            </a>
          </>
        ) : null}
      </p>
      <div className="mt-2 flex gap-2">
        <button disabled={pending} onClick={() => decide("APPROVED")} className="tap-target flex-1 rounded-full bg-ok/10 px-3 text-xs font-semibold text-ok disabled:opacity-50">
          {lang === "es" ? "Aprobar" : "Approve"}
        </button>
        <button disabled={pending} onClick={() => decide("DENIED")} className="tap-target flex-1 rounded-full bg-critical/10 px-3 text-xs font-semibold text-critical disabled:opacity-50">
          {lang === "es" ? "Denegar" : "Deny"}
        </button>
      </div>
    </div>
  );
}
