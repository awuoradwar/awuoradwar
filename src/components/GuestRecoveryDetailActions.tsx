"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeReplacementAction,
  markNotRequiredAction,
  addGuestRecoveryFollowUpAction,
} from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { btnPrimary, btnNeutral } from "./forms/FormShell";

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
  const [optimisticallyFinal, setOptimisticallyFinal] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const isFinal = status === "COMPLETED" || status === "NOT_REQUIRED" || optimisticallyFinal;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!isFinal && (
          <button
            disabled={pending}
            onClick={() => {
              setOptimisticallyFinal(true);
              startTransition(async () => {
                try {
                  await completeReplacementAction(id);
                } catch {
                  setOptimisticallyFinal(false);
                }
                router.refresh();
              });
            }}
            className={btnPrimary}
          >
            {lang === "es" ? "Marcar Cumplido" : "Mark Fulfilled"}
          </button>
        )}
        {!isFinal && (
          <button
            disabled={pending}
            onClick={() => {
              setOptimisticallyFinal(true);
              startTransition(async () => {
                try {
                  await markNotRequiredAction(id);
                } catch {
                  setOptimisticallyFinal(false);
                }
                router.refresh();
              });
            }}
            className={btnNeutral}
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
            className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
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
            className="tap-target rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
          >
            {t(lang, "action_save")}
          </button>
        </div>
      )}
    </div>
  );
}
