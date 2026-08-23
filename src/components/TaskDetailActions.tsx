"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeTaskAction,
  verifyTaskAction,
  reassignTaskAction,
  setTaskSupportAction,
  carryForwardTaskAction,
  cancelTaskAction,
  cancelTaskSeriesAction,
} from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { btnPrimary, btnOk, btnNeutral, btnDanger } from "./forms/FormShell";

export default function TaskDetailActions({
  taskId,
  lang,
  managers,
  status,
  verificationRequired,
  templateId,
  canManageSeries,
  currentSupportId,
}: {
  taskId: string;
  lang: Language;
  managers: Array<{ id: string; name: string }>;
  status: string;
  verificationRequired: boolean;
  templateId?: string | null;
  canManageSeries?: boolean;
  currentSupportId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [reassignTo, setReassignTo] = useState("");
  const [supportPick, setSupportPick] = useState(currentSupportId || "");
  const [confirmingSeries, setConfirmingSeries] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [optimisticallyVerified, setOptimisticallyVerified] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function runStatus(nextStatus: string, fn: () => Promise<unknown>) {
    setOptimisticStatus(nextStatus);
    startTransition(async () => {
      try {
        await fn();
      } catch {
        setOptimisticStatus(null);
      }
      router.refresh();
    });
  }

  const effectiveStatus = optimisticStatus ?? status;
  const openish = effectiveStatus !== "COMPLETE" && effectiveStatus !== "CANCELLED";
  const isRecurring = !!templateId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {openish && (
          <button
            disabled={pending}
            onClick={() => runStatus("COMPLETE", () => completeTaskAction(taskId))}
            className={btnPrimary}
          >
            {t(lang, "action_complete")}
          </button>
        )}
        {verificationRequired && effectiveStatus === "COMPLETE" && !optimisticallyVerified && (
          <button
            disabled={pending}
            onClick={() => {
              setOptimisticallyVerified(true);
              startTransition(async () => {
                try {
                  await verifyTaskAction(taskId);
                } catch {
                  setOptimisticallyVerified(false);
                }
                router.refresh();
              });
            }}
            className={btnOk}
          >
            {t(lang, "action_verify")}
          </button>
        )}
        {openish && (
          <button
            disabled={pending}
            onClick={() => run(() => carryForwardTaskAction(taskId))}
            className={btnNeutral}
          >
            {t(lang, "action_carry_forward")}
          </button>
        )}
        {openish && (
          <button
            disabled={pending}
            onClick={() => runStatus("CANCELLED", () => cancelTaskAction(taskId, lang === "es" ? "Cancelado por gerente" : "Cancelled by manager"))}
            className={btnDanger}
          >
            {isRecurring ? (lang === "es" ? "Cancelar solo hoy" : "Cancel this day") : t(lang, "action_cancel")}
          </button>
        )}
        {openish && isRecurring && canManageSeries && (
          <button
            disabled={pending}
            onClick={() => setConfirmingSeries(true)}
            className={btnDanger}
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
              onClick={() => {
                setOptimisticStatus("CANCELLED");
                setConfirmingSeries(false);
                startTransition(async () => {
                  try {
                    await cancelTaskSeriesAction(templateId as string, lang === "es" ? "Serie cancelada por gerente" : "Series cancelled by manager");
                  } catch {
                    setOptimisticStatus(null);
                  }
                  router.refresh();
                });
              }}
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
      {openish && (
        <div className="flex items-center gap-2">
          <select
            value={supportPick}
            onChange={(e) => setSupportPick(e.target.value)}
            className="tap-target flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors hover:border-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
          >
            <option value="">{lang === "es" ? "Apoyo: nadie más" : "Support: no one else"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            disabled={pending || supportPick === (currentSupportId || "")}
            onClick={() => run(() => setTaskSupportAction(taskId, supportPick || null))}
            className="tap-target rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
          >
            {t(lang, "action_save")}
          </button>
        </div>
      )}
    </div>
  );
}
