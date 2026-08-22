"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAckCompletionAction, verifyAckCompletionAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export interface CompletionRow {
  id: string;
  associate_name: string;
  completed: number;
  completed_at: string | null;
  completed_at_formatted?: string | null;
  verified_by: string | null;
  verified_by_name?: string | null;
  verified_at: string | null;
  verified_at_formatted?: string | null;
}

export default function AcknowledgementRow({ completion, lang }: { completion: CompletionRow; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyAcknowledged, setOptimisticallyAcknowledged] = useState(false);
  const [optimisticallyVerified, setOptimisticallyVerified] = useState(false);
  const router = useRouter();

  const completed = !!completion.completed || optimisticallyAcknowledged;
  const verified = !!completion.verified_at || optimisticallyVerified;
  const hasDetails = !!completion.completed_at || !!completion.verified_at;

  return (
    <details className="px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium">{completion.associate_name}</p>
          {verified ? (
            <p className="text-xs text-ok">{t(lang, "status_verified")}</p>
          ) : completed ? (
            <p className="text-xs text-warning">{t(lang, "status_completed")}</p>
          ) : (
            <p className="text-xs text-muted">{t(lang, "status_open")}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
        {!completed && (
          <button
            disabled={pending}
            onClick={() => {
              setOptimisticallyAcknowledged(true);
              startTransition(async () => {
                try {
                  await markAckCompletionAction(completion.id);
                } catch {
                  setOptimisticallyAcknowledged(false);
                }
                router.refresh();
              });
            }}
            className="h-9 min-h-0 inline-flex items-center justify-center rounded-full border-2 border-accent px-3 text-xs font-semibold text-accent disabled:opacity-40"
          >
            {t(lang, "action_acknowledge")}
          </button>
        )}
        {completed && !verified && (
          <button
            disabled={pending}
            onClick={() => {
              setOptimisticallyVerified(true);
              startTransition(async () => {
                try {
                  await verifyAckCompletionAction(completion.id);
                } catch {
                  setOptimisticallyVerified(false);
                }
                router.refresh();
              });
            }}
            className="h-9 min-h-0 inline-flex items-center justify-center rounded-full border-2 border-ok px-3 text-xs font-semibold text-ok disabled:opacity-40"
          >
            {t(lang, "action_verify")}
          </button>
        )}
        </div>
      </summary>
      {hasDetails && (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-border pt-1.5 text-xs text-muted">
          {completion.completed_at && (
            <p>
              {t(lang, "status_completed")}: {completion.completed_at_formatted || completion.completed_at}
            </p>
          )}
          {completion.verified_at && (
            <p>
              {t(lang, "status_verified")}: {completion.verified_at_formatted || completion.verified_at}
              {completion.verified_by_name ? ` · ${completion.verified_by_name}` : ""}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
