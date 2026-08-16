"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";

export interface TaskCardData {
  id: string;
  title: string;
  title_es?: string | null;
  area: string | null;
  owner_name: string | null;
  due_at: string | null;
  effort: string;
  status: string;
  blocked: boolean;
  verification_required: number;
}

export default function TaskCard({ task, lang }: { task: TaskCardData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dueLabel = task.due_at
    ? new Date(task.due_at).toLocaleTimeString(lang === "es" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })
    : null;
  const title = lang === "es" && task.title_es ? task.title_es : task.title;

  return (
    <div className="card flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <Link href={`/task/${task.id}`} className="block">
          <p className="truncate text-sm font-semibold">{title}</p>
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {dueLabel && <span>⏰ {dueLabel}</span>}
          {task.area && <span>· {task.area}</span>}
          {task.owner_name && <span>· {task.owner_name}</span>}
          <span className="rounded bg-zinc-100 px-1.5 py-0.5">{t(lang, `effort_${task.effort.toLowerCase()}` as never)}</span>
          {task.blocked && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-warning">
              {lang === "es" ? "Bloqueado" : "Blocked"}
            </span>
          )}
        </div>
        <div className="mt-2">
          <StatusBadge status={task.status} lang={lang} />
        </div>
      </div>
      {task.status !== "COMPLETE" && task.status !== "CANCELLED" && (
        <button
          type="button"
          disabled={pending || task.blocked}
          onClick={() =>
            startTransition(async () => {
              await completeTaskAction(task.id);
              router.refresh();
            })
          }
          className="tap-target shrink-0 rounded-full border-2 border-accent px-4 text-xs font-semibold text-accent disabled:opacity-40"
        >
          {pending ? "…" : `✓ ${t(lang, "action_complete")}`}
        </button>
      )}
    </div>
  );
}
