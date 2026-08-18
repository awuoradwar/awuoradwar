"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeTaskAction,
  verifyTaskAction,
  reassignTaskAction,
  carryForwardTaskAction,
  cancelTaskAction,
  cancelTaskSeriesAction,
} from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function TaskDetailActions({
  taskId,
  lang,
  managers,
  status,
  verificationRequired,
  templateId,
  canManageSeries,
}: {
  taskId: string;
  lang: Language;
  managers: Array<{ id: string; name: string }>;
  status: string;
  verificationRequired: boolean;
  templateId?: string | null;
  canManageSeries?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [reassignTo, setReassignTo] = useState("");
  const [confirmingSeries, setConfirmingSeries] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const openish = status !== "COMPLETE" && status !== "CANCELLED";
  const isRecurring = !!templateId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {openish && (
          <button
            disabled={pending}
            onClick={() => run(() => completeTaskAction(taskId))}
            className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
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
            onClick={() => run(() => carryForwardTaskAction(taskId))}
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
            {isRecurring ? (lang === "es" ? "Cancelar solo hoy" : "Cancel this day") : t(lang, "action_cancel")}
          </button>
        )}
        {openish && isRecurring && canManageSeries && (
          <button
            disabled={pending}
            onClick={() => setConfirmingSeries(true)}
            className="tap-target rounded-full border border-critical px-4 text-sm font-semibold text-critical disabled:opacity-50"
          >
            {lang === "es" ? "Cancelar toda la serie" : "Cancel entire series"}
          </button>
        )}
      </div>
      {confirmingSeries && (
        <div className="card flex flex-col gap-2 border-critical/40 p-3">
          <p className="text-sm">
            {lang === "es"
              ? "Esto detiene esta tarea recurrente para siempre y cancela cualquier ocurrencia pendiente. ¿Continuar?"
              : "This stops this recurring task forever and cancels any pending occurrences. Continue?"}
          </p>
          <div className="flex items-center gap-3">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await cancelTaskSeriesAction(templateId as string, lang === "es" ? "Serie cancelada por gerente" : "Series cancelled by manager");
                  setConfirmingSeries(false);
                  router.refresh();
                })
              }
              className="tap-target rounded-full bg-critical px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {lang === "es" ? "Sí, cancelar serie" : "Yes, cancel series"}
            </button>
            <button type="button" onClick={() => setConfirmingSeries(false)} disabled={pending} className="text-sm font-medium text-muted">
              {lang === "es" ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </div>
      )}
      {openish && (
        <div className="flex items-center gap-2">
          <select
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
            className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
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
            className="tap-target rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
          >
            {t(lang, "action_save")}
          </button>
        </div>
      )}
    </div>
  );
}
