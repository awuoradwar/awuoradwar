"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import OwnerBadge from "./OwnerBadge";
import { ManagerColor } from "@/lib/managerColor";
import { withFrom } from "@/lib/backHref";

export interface TaskCardData {
  id: string;
  title: string;
  title_es?: string | null;
  description?: string | null;
  area: string | null;
  owner_id: string | null;
  owner_name: string | null;
  support_id?: string | null;
  support_name?: string | null;
  due_at: string | null;
  /** Store-local due time, pre-formatted server-side (formatStoreDateTime
   * is server-only, so this client component can't compute it itself). */
  dueLabel?: string | null;
  effort: string;
  status: string;
  blocked: boolean;
  verification_required: number;
}

export default function TaskCard({ task, lang, managerColors, from }: { task: TaskCardData; lang: Language; managerColors?: Record<string, ManagerColor>; from?: string }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDone, setOptimisticallyDone] = useState(false);
  const router = useRouter();

  const title = lang === "es" && task.title_es ? task.title_es : task.title;

  return (
    <div className="card flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <Link href={from ? withFrom(`/task/${task.id}`, from) : `/task/${task.id}`} className="block">
          <p className="truncate text-sm font-semibold">{title}</p>
        </Link>
        {task.description && <p className="mt-0.5 text-xs text-muted">{task.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {task.dueLabel && <span>⏰ {task.dueLabel}</span>}
          {task.area && <span>· {task.area}</span>}
          {task.owner_name && (
            <span>
              · <OwnerBadge name={task.owner_name} ownerId={task.owner_id} managerColors={managerColors} />
            </span>
          )}
          {task.support_name && (
            <span>
              + <OwnerBadge name={task.support_name} ownerId={task.support_id ?? null} managerColors={managerColors} />
            </span>
          )}
          <span className="rounded bg-muted/10 px-1.5 py-0.5">{t(lang, `effort_${task.effort.toLowerCase()}` as never)}</span>
          {task.blocked && (
            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning">
              {lang === "es" ? "Bloqueado" : "Blocked"}
            </span>
          )}
        </div>
        <div className="mt-2">
          <StatusBadge status={optimisticallyDone ? "COMPLETE" : task.status} lang={lang} />
        </div>
      </div>
      {task.status !== "COMPLETE" && task.status !== "CANCELLED" && !optimisticallyDone && (
        <button
          type="button"
          disabled={pending || task.blocked}
          onClick={() => {
            // Flip the visible state immediately -- the actual round trip
            // to the server (action + full-page refresh) still takes real
            // network time, but the tap shouldn't feel like it did nothing
            // until that finishes.
            setOptimisticallyDone(true);
            startTransition(async () => {
              try {
                await completeTaskAction(task.id);
              } catch {
                setOptimisticallyDone(false);
              }
              router.refresh();
            });
          }}
          className="h-9 min-h-0 inline-flex shrink-0 items-center justify-center rounded-full border-2 border-accent px-4 text-xs font-semibold text-accent disabled:opacity-40"
        >
          {pending ? "…" : `✓ ${t(lang, "action_complete")}`}
        </button>
      )}
    </div>
  );
}
