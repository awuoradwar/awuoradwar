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
  verified_by: string | null;
  verified_at: string | null;
}

export default function AcknowledgementRow({ completion, lang }: { completion: CompletionRow; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyAcknowledged, setOptimisticallyAcknowledged] = useState(false);
  const [optimisticallyVerified, setOptimisticallyVerified] = useState(false);
  const router = useRouter();

  const completed = !!completion.completed || optimisticallyAcknowledged;
  const verified = !!completion.verified_at || optimisticallyVerified;

  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
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
      <div className="flex shrink-0 gap-2">
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
            className="tap-target rounded-full border-2 border-accent px-3 text-xs font-semibold text-accent disabled:opacity-40"
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
            className="tap-target rounded-full border-2 border-ok px-3 text-xs font-semibold text-ok disabled:opacity-40"
          >
            {t(lang, "action_verify")}
          </button>
        )}
      </div>
    </div>
  );
}
