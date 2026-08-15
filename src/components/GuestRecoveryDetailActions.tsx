"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveReplacementAction,
  completeReplacementAction,
  markNotRequiredAction,
  addGuestRecoveryFollowUpAction,
} from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function GuestRecoveryDetailActions({
  id,
  lang,
  status,
}: {
  id: string;
  lang: Language;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const isFinal = status === "COMPLETED" || status === "NOT_REQUIRED";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING" && (
          <button
            disabled={pending}
            onClick={() => run(() => approveReplacementAction(id))}
            className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t(lang, "action_approve")}
          </button>
        )}
        {status === "APPROVED" && (
          <button
            disabled={pending}
            onClick={() => run(() => completeReplacementAction(id))}
            className="tap-target rounded-full border-2 border-ok px-4 text-sm font-semibold text-ok disabled:opacity-50"
          >
            {t(lang, "action_complete")}
          </button>
        )}
        {!isFinal && (
          <button
            disabled={pending}
            onClick={() => run(() => markNotRequiredAction(id))}
            className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted disabled:opacity-50"
          >
            {t(lang, "action_not_required")}
          </button>
        )}
      </div>

      {!followUpOpen ? (
        <button
          type="button"
          onClick={() => setFollowUpOpen(true)}
          className="tap-target self-start rounded-xl border-2 border-dashed border-accent px-4 text-xs font-semibold text-accent"
        >
          {t(lang, "action_add_follow_up")}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={followUpTitle}
            onChange={(e) => setFollowUpTitle(e.target.value)}
            placeholder={t(lang, "field_title")}
            className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          />
          <button
            disabled={pending || !followUpTitle.trim()}
            onClick={() =>
              run(async () => {
                await addGuestRecoveryFollowUpAction(id, followUpTitle.trim());
                setFollowUpOpen(false);
                setFollowUpTitle("");
              })
            }
            className="tap-target rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t(lang, "action_save")}
          </button>
        </div>
      )}
    </div>
  );
}
