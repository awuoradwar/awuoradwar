"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reassignTaskAction, setTaskSupportAction, cancelTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import { IncomingHandoffLine } from "./TaskCard";
import { ManagerColor } from "@/lib/managerColor";
import { withFrom } from "@/lib/backHref";

export interface WeekTaskData {
  id: string;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
  source: string | null;
  status: string;
  owner_id: string | null;
  owner_name: string | null;
  support_ids: string | null;
  /** A note handed to this task from an upstream one -- shown in red. */
  incomingHandoff?: { note: string; fromTitle: string } | null;
}

/** Week view row: click the title for full detail, or assign/remove right here
 * without leaving the page -- planning a week one click-through at a time
 * doesn't scale when there are dozens of items to staff. */
export default function WeekTaskRow({
  task,
  managers,
  lang,
  managerColors,
  from,
}: {
  task: WeekTaskData;
  managers: Array<{ id: string; name: string }>;
  lang: Language;
  managerColors?: Record<string, ManagerColor>;
  from?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyCancelled, setOptimisticallyCancelled] = useState(false);
  const [ownerId, setOwnerId] = useState(task.owner_id || "");
  const [supportId, setSupportId] = useState(task.support_ids ? (JSON.parse(task.support_ids)[0] ?? "") : "");
  const router = useRouter();
  const title = lang === "es" && task.title_es ? task.title_es : task.title;
  const description = lang === "es" && task.description_es ? task.description_es : task.description;
  const removable = task.status !== "COMPLETE" && task.status !== "CANCELLED" && !optimisticallyCancelled;
  const ownerColor = ownerId ? managerColors?.[ownerId] : undefined;
  const supportColor = supportId ? managerColors?.[supportId] : undefined;

  if (optimisticallyCancelled) return null;

  return (
    <div className="flex items-center justify-between gap-2 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={from ? withFrom(`/task/${task.id}`, from) : `/task/${task.id}`} className="truncate font-medium hover:text-accent">
            {title}
          </Link>
          <span
            className={
              "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide " +
              (task.source === "recurring" ? "bg-muted/10 text-muted" : "bg-accent/10 text-accent")
            }
          >
            {task.source === "recurring" ? (lang === "es" ? "Recurrente" : "Recurring") : lang === "es" ? "Agregada" : "Added"}
          </span>
        </div>
        <IncomingHandoffLine handoff={task.incomingHandoff} lang={lang} />
        {description && <p className="mt-0.5 truncate text-xs text-muted">{description}</p>}
        <div className="mt-1 flex items-center gap-2">
          <select
            value={ownerId}
            disabled={pending || !removable}
            onChange={(e) => {
              const newOwnerId = e.target.value;
              setOwnerId(newOwnerId);
              if (!newOwnerId) return;
              startTransition(async () => {
                await reassignTaskAction(task.id, newOwnerId);
                router.refresh();
              });
            }}
            style={ownerColor ? { backgroundColor: ownerColor.bg, color: ownerColor.text, borderColor: "transparent" } : undefined}
            className={`rounded-lg border px-1.5 py-0.5 text-xs outline-none transition-colors hover:border-muted/50 focus:border-accent disabled:opacity-50 ${ownerColor ? "font-medium" : "border-border bg-card text-muted"}`}
          >
            <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={supportId}
            disabled={pending || !removable}
            onChange={(e) => {
              const newSupportId = e.target.value;
              setSupportId(newSupportId);
              startTransition(async () => {
                await setTaskSupportAction(task.id, newSupportId || null);
                router.refresh();
              });
            }}
            style={supportColor ? { backgroundColor: supportColor.bg, color: supportColor.text, borderColor: "transparent" } : undefined}
            className={`rounded-lg border px-1.5 py-0.5 text-xs outline-none transition-colors hover:border-muted/50 focus:border-accent disabled:opacity-50 ${supportColor ? "font-medium" : "border-border bg-card text-muted"}`}
          >
            <option value="">{lang === "es" ? "+ Apoyo" : "+ Support"}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={task.status} lang={lang} />
        {removable && (
          <button
            type="button"
            disabled={pending}
            aria-label={lang === "es" ? "Eliminar" : "Remove"}
            onClick={() => {
              setOptimisticallyCancelled(true);
              startTransition(async () => {
                try {
                  await cancelTaskAction(task.id, lang === "es" ? "Eliminado desde la vista semanal" : "Removed from week view");
                } catch {
                  setOptimisticallyCancelled(false);
                }
                router.refresh();
              });
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-50"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
