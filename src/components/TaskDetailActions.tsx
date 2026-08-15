"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeTaskAction,
  verifyTaskAction,
  reassignTaskAction,
  carryForwardTaskAction,
  cancelTaskAction,
} from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function TaskDetailActions({
  taskId,
  lang,
  managers,
  status,
  verificationRequired,
}: {
  taskId: string;
  lang: Language;
  managers: Array<{ id: string; name: string }>;
  status: string;
  verificationRequired: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [reassignTo, setReassignTo] = useState("");
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const openish = status !== "COMPLETE" && status !== "CANCELLED";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {openish && (
          <button disabled={pending} onClick={() => run(() => completeTaskAction(taskId))} className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50">
            {t(lang, "action_complete")}
          </button>
        )}
        {verificationRequired && status === "COMPLETE" && (
          <button disabled={pending} onClick={() => run(() => verifyTaskAction(taskId))} className="tap-target rounded-full border-2 border-ok px-4 text-sm font-semibold text-ok disabled:opacity-50">
            {t(lang, "action_verify")}
          </button>
        )}
        {openish && (
          <button
            disabled={pending}
            onClick={() => run(() => carryForwardTaskAction(taskId, new Date(Date.now() + 86400000).toISOString().slice(0, 10)))}
            className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted disabled:opacity-50"
          >
            {t(lang, "action_carry_forward")}
          </button>
        )}
        {openish && (
          <button
            disabled={pending}
            onClick={() => run(() => cancelTaskAction(taskId, lang === "es" ? "Cancelado por gerente" : "Cancelled by manager"))}
            className="tap-target rounded-full border border-critical px-4 text-sm font-semibold text-critical disabled:opacity-50"
          >
            {t(lang, "action_cancel")}
          </button>
        )}
      </div>
      {openish && (
        <div className="flex items-center gap-2">
          <select
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
            className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm"
          >
            <option value="">{t(lang, "action_reassign")}…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            disabled={pending || !reassignTo}
            onClick={() => run(() => reassignTaskAction(taskId, reassignTo))}
            className="tap-target rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t(lang, "action_save")}
          </button>
        </div>
      )}
    </div>
  );
}
