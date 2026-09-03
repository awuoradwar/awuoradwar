"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import OwnerBadge from "./OwnerBadge";
import HandoffNotePrompt from "./HandoffNotePrompt";
import { ManagerColor } from "@/lib/managerColor";
import { withFrom } from "@/lib/backHref";

/** Red line under a task title: a note handed forward from an upstream
 * task (e.g. the change amount from "Place Loomis change order"). Red on
 * purpose -- it's the one thing the person doing this task must not miss. */
export function IncomingHandoffLine({ handoff, lang }: { handoff: { note: string; fromTitle: string } | null | undefined; lang: Language }) {
  if (!handoff) return null;
  return (
    <p className="mt-0.5 text-sm font-bold text-critical">
      🔴 {handoff.note}
      <span className="font-normal opacity-80">
        {" "}· {lang === "es" ? "de" : "from"} {handoff.fromTitle}
      </span>
    </p>
  );
}

export interface TaskCardData {
  id: string;
  title: string;
  title_es?: string | null;
  description?: string | null;
  description_es?: string | null;
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
  /** Set when completing this task should ask for a note to hand forward. */
  handoffPrompt?: { targetTitle: string } | null;
  /** A note handed to this task from an upstream one -- shown in red. */
  incomingHandoff?: { note: string; fromTitle: string } | null;
}

export default function TaskCard({
  task,
  lang,
  managerColors,
  from,
  endOfDayUrgent,
}: {
  task: TaskCardData;
  lang: Language;
  managerColors?: Record<string, ManagerColor>;
  from?: string;
  /** The store is heading toward close/midnight and this task is still open --
   * flip it red so it doesn't quietly roll into tomorrow unnoticed. */
  endOfDayUrgent?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDone, setOptimisticallyDone] = useState(false);
  const [askingNote, setAskingNote] = useState(false);
  const router = useRouter();

  const title = lang === "es" && task.title_es ? task.title_es : task.title;
  const description = lang === "es" && task.description_es ? task.description_es : task.description;
  const isOpen = task.status !== "COMPLETE" && task.status !== "CANCELLED" && !optimisticallyDone;
  const urgent = endOfDayUrgent && isOpen;

  function complete(note?: string) {
    // Flip the visible state immediately -- the actual round trip to the
    // server (action + full-page refresh) still takes real network time,
    // but the tap shouldn't feel like it did nothing until that finishes.
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
    <div className={`card flex flex-wrap items-start gap-3 p-3 ${urgent ? "border-critical/50" : ""}`}>
      <div className="min-w-0 flex-1">
        <Link href={from ? withFrom(`/task/${task.id}`, from) : `/task/${task.id}`} className="block">
          <p className="truncate text-sm font-semibold">{title}</p>
        </Link>
        <IncomingHandoffLine handoff={task.incomingHandoff} lang={lang} />
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {task.dueLabel && (
            <span className={urgent ? "font-semibold text-critical" : ""}>
              ⏰ {task.dueLabel}
            </span>
          )}
          {urgent && (
            <span className="font-semibold text-critical">· {lang === "es" ? "Cierra pronto" : "Closing soon"}</span>
          )}
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
      {isOpen && !askingNote && (
        <button
          type="button"
          disabled={pending || task.blocked}
          onClick={() => (task.handoffPrompt ? setAskingNote(true) : complete())}
          className="h-9 min-h-0 inline-flex shrink-0 items-center justify-center rounded-full border-2 border-accent px-4 text-xs font-semibold text-accent disabled:opacity-40"
        >
          {pending ? "…" : `✓ ${t(lang, "action_complete")}`}
        </button>
      )}
      {isOpen && askingNote && task.handoffPrompt && (
        <div className="basis-full">
          <HandoffNotePrompt targetTitle={task.handoffPrompt.targetTitle} lang={lang} pending={pending} onConfirm={complete} onCancel={() => setAskingNote(false)} />
        </div>
      )}
    </div>
  );
}
