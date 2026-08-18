"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMaintenanceDoneAction, removeMaintenanceItemAction } from "@/app/actions/inventoryActions";
import { MaintenanceItem, MaintenanceHistoryRow } from "@/lib/services/maintenanceService";
import { Language } from "@/lib/types";

function dueLabel(daysUntilDue: number, lang: Language): { text: string; tone: "critical" | "warning" | "ok" } {
  if (daysUntilDue < 0) {
    return { text: `${lang === "es" ? "Vencido hace" : "Overdue by"} ${Math.abs(daysUntilDue)}${lang === "es" ? " d" : "d"}`, tone: "critical" };
  }
  if (daysUntilDue === 0) return { text: lang === "es" ? "Vence hoy" : "Due today", tone: "warning" };
  if (daysUntilDue <= 7) return { text: `${lang === "es" ? "Vence en" : "Due in"} ${daysUntilDue}${lang === "es" ? " d" : "d"}`, tone: "warning" };
  return { text: `${lang === "es" ? "Vence en" : "Due in"} ${daysUntilDue}${lang === "es" ? " d" : "d"}`, tone: "ok" };
}

export default function MaintenanceItemRow({
  item,
  history,
  lang,
  canManage,
}: {
  item: MaintenanceItem;
  history: MaintenanceHistoryRow[];
  lang: Language;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const due = dueLabel(item.daysUntilDue, lang);
  const toneClass = due.tone === "critical" ? "text-critical" : due.tone === "warning" ? "text-warning" : "text-ok";

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted">
            {item.location && <span>{item.location} · </span>}
            {lang === "es" ? "cada" : "every"} {item.interval_days}{lang === "es" ? "d" : "d"}
          </p>
          {item.notes && <p className="mt-0.5 text-xs italic text-muted">{item.notes}</p>}
          <p className="mt-0.5 text-xs text-muted">
            {item.last_done_at
              ? `${lang === "es" ? "Última vez" : "Last done"}: ${new Date(item.last_done_at).toLocaleDateString()}${item.last_done_by_name ? ` · ${item.last_done_by_name}` : ""}`
              : lang === "es"
                ? "Nunca registrado"
                : "Never logged"}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-bold ${toneClass}`}>{due.text}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          disabled={pending}
          onClick={() => run(() => markMaintenanceDoneAction(item.id))}
          className="tap-target rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          {lang === "es" ? "Marcar Hecho Hoy" : "Mark Done Today"}
        </button>
        {canManage && (
          <button
            disabled={pending}
            onClick={() => run(() => removeMaintenanceItemAction(item.id))}
            className="tap-target ml-auto px-2 text-xs font-medium text-critical disabled:opacity-50"
          >
            {lang === "es" ? "Quitar" : "Remove"}
          </button>
        )}
      </div>
      {history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted">
            {lang === "es" ? "Ver historial" : "View history"} ({history.length})
          </summary>
          <div className="mt-1 flex flex-col gap-0.5">
            {history.slice(0, 10).map((h) => (
              <p key={h.id} className="text-xs text-muted">
                {new Date(h.created_at).toLocaleDateString()} · {h.actor_name || "—"}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
