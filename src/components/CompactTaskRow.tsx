"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { TaskCardData } from "./TaskCard";
import OwnerBadge from "./OwnerBadge";
import { ManagerColor } from "@/lib/managerColor";

/** Slim single-line row for lower-priority, usually-collapsed sections
 * (This Week, Recurring) -- keeps those sections scannable without the
 * full TaskCard's padding and badges. */
export default function CompactTaskRow({ task, lang, managerColors }: { task: TaskCardData; lang: Language; managerColors?: Record<string, ManagerColor> }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDone, setOptimisticallyDone] = useState(false);
  const router = useRouter();

  const title = lang === "es" && task.title_es ? task.title_es : task.title;

  const canComplete = task.status !== "COMPLETE" && task.status !== "CANCELLED" && !optimisticallyDone;

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Link href={`/task/${task.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        {task.description && <p className="truncate text-xs text-muted">{task.description}</p>}
        <p className="truncate text-xs text-muted">
          {task.dueLabel && <span>⏰ {task.dueLabel} </span>}
          {task.area && <span>· {task.area} </span>}
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
        </p>
      </Link>
      {canComplete && (
        <button
          type="button"
          aria-label={lang === "es" ? "Completar" : "Complete"}
          disabled={pending || task.blocked}
          onClick={() => {
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent text-xs font-semibold text-accent disabled:opacity-40"
        >
          {pending ? "…" : "✓"}
        </button>
      )}
    </div>
  );
}
