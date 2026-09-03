"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { TaskCardData, IncomingHandoffLine } from "./TaskCard";
import OwnerBadge from "./OwnerBadge";
import HandoffNotePrompt from "./HandoffNotePrompt";
import { ManagerColor } from "@/lib/managerColor";
import { withFrom } from "@/lib/backHref";

/** Slim single-line row for lower-priority, usually-collapsed sections
 * (This Week, Recurring) -- keeps those sections scannable without the
 * full TaskCard's padding and badges. */
export default function CompactTaskRow({ task, lang, managerColors, from }: { task: TaskCardData; lang: Language; managerColors?: Record<string, ManagerColor>; from?: string }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDone, setOptimisticallyDone] = useState(false);
  const [askingNote, setAskingNote] = useState(false);
  const router = useRouter();

  const title = lang === "es" && task.title_es ? task.title_es : task.title;
  const description = lang === "es" && task.description_es ? task.description_es : task.description;

  const canComplete = task.status !== "COMPLETE" && task.status !== "CANCELLED" && !optimisticallyDone;

  function complete(note?: string) {
    setOptimisticallyDone(true);
    setAskingNote(false);
    startTransition(async () => {
      try {
        await completeTaskAction(task.id, note);
      } catch {
        setOptimisticallyDone(false);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Link href={from ? withFrom(`/task/${task.id}`, from) : `/task/${task.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        <IncomingHandoffLine handoff={task.incomingHandoff} lang={lang} />
        {description && <p className="truncate text-xs text-muted">{description}</p>}
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
      {canComplete && !askingNote && (
        // 44px hit area (h-11 w-11) with the visible ring drawn inside it --
        // the old 28px circle was a real miss-tap problem on a phone.
        <button
          type="button"
          aria-label={lang === "es" ? "Completar" : "Complete"}
          disabled={pending || task.blocked}
          onClick={() => (task.handoffPrompt ? setAskingNote(true) : complete())}
          className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent text-sm font-semibold text-accent">
            {pending ? "…" : "✓"}
          </span>
        </button>
      )}
      {canComplete && askingNote && task.handoffPrompt && (
        <div className="basis-full">
          <HandoffNotePrompt targetTitle={task.handoffPrompt.targetTitle} lang={lang} pending={pending} onConfirm={complete} onCancel={() => setAskingNote(false)} />
        </div>
      )}
    </div>
  );
}
