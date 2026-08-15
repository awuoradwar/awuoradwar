"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateHandoffAction,
  completeOutgoingHandoffAction,
  acknowledgeHandoffAction,
} from "@/app/actions/handoffActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

interface HandoffLite {
  id: string;
  status: string;
  outgoing_note: string | null;
}

export default function HandoffActions({ lang, handoff }: { lang: Language; handoff: HandoffLite | null }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!handoff) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await generateHandoffAction(); router.refresh(); })}
        className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground disabled:opacity-60"
      >
        {lang === "es" ? "Generar entrega" : "Generate handoff"}
      </button>
    );
  }

  if (handoff.status === "GENERATED") {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t(lang, "handoff_outgoing_note")}
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await completeOutgoingHandoffAction(handoff.id, note); router.refresh(); })}
          className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground disabled:opacity-60"
        >
          {t(lang, "action_complete_handoff")}
        </button>
      </div>
    );
  }

  if (handoff.status === "OUTGOING_COMPLETED") {
    return (
      <div className="flex flex-col gap-2">
        {handoff.outgoing_note && <p className="card p-3 text-sm italic">&ldquo;{handoff.outgoing_note}&rdquo;</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await acknowledgeHandoffAction(handoff.id); router.refresh(); })}
          className="tap-target w-full rounded-xl bg-accent font-semibold text-accent-foreground disabled:opacity-60"
        >
          {t(lang, "action_acknowledge")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-emerald-50 p-3 text-sm text-ok">
      {lang === "es" ? "Entrega confirmada." : "Handoff acknowledged."}
    </div>
  );
}
