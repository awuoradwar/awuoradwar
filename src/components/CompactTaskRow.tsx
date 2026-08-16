"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { TaskCardData } from "./TaskCard";

/** Slim single-line row for lower-priority, usually-collapsed sections
 * (This Week, Recurring) -- keeps those sections scannable without the
 * full TaskCard's padding and badges. */
export default function CompactTaskRow({ task, lang }: { task: TaskCardData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dueLabel = task.due_at
    ? new Date(task.due_at).toLocaleTimeString(lang === "es" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  const canComplete = task.status !== "COMPLETE" && task.status !== "CANCELLED";

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Link href={`/task/${task.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm">{task.title}</p>
        <p className="truncate text-[11px] text-muted">
          {dueLabel && <span>⏰ {dueLabel} </span>}
          {task.area && <span>· {task.area} </span>}
          {task.owner_name && <span>· {task.owner_name}</span>}
        </p>
      </Link>
      {canComplete && (
        <button
          type="button"
          aria-label={lang === "es" ? "Completar" : "Complete"}
          disabled={pending || task.blocked}
          onClick={() =>
            startTransition(async () => {
              await completeTaskAction(task.id);
              router.refresh();
            })
          }
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent text-xs font-semibold text-accent disabled:opacity-40"
        >
          {pending ? "…" : "✓"}
        </button>
      )}
    </div>
  );
}
