"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reassignTaskAction, cancelTaskAction } from "@/app/actions/taskActions";
import { Language } from "@/lib/types";
import StatusBadge from "./StatusBadge";

export interface WeekTaskData {
  id: string;
  title: string;
  title_es: string | null;
  source: string | null;
  status: string;
  owner_id: string | null;
  owner_name: string | null;
}

/** Week view row: click the title for full detail, or assign/remove right here
 * without leaving the page -- planning a week one click-through at a time
 * doesn't scale when there are dozens of items to staff. */
export default function WeekTaskRow({
  task,
  managers,
  lang,
}: {
  task: WeekTaskData;
  managers: Array<{ id: string; name: string }>;
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const title = lang === "es" && task.title_es ? task.title_es : task.title;
  const removable = task.status !== "COMPLETE" && task.status !== "CANCELLED";

  return (
    <div className="flex items-center justify-between gap-2 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/task/${task.id}`} className="truncate font-medium hover:text-accent">
            {title}
          </Link>
          <span
            className={
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
              (task.source === "recurring" ? "bg-muted/10 text-muted" : "bg-accent/10 text-accent")
            }
          >
            {task.source === "recurring" ? (lang === "es" ? "Recurrente" : "Recurring") : lang === "es" ? "Agregada" : "Added"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <select
            defaultValue={task.owner_id || ""}
            disabled={pending || !removable}
            onChange={(e) => {
              const newOwnerId = e.target.value;
              if (!newOwnerId) return;
              startTransition(async () => {
                await reassignTaskAction(task.id, newOwnerId);
                router.refresh();
              });
            }}
            className="rounded-lg border border-border bg-card px-1.5 py-0.5 text-xs text-muted outline-none transition-colors hover:border-muted/50 focus:border-accent disabled:opacity-50"
          >
            <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
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
            onClick={() =>
              startTransition(async () => {
                await cancelTaskAction(task.id, lang === "es" ? "Eliminado desde la vista semanal" : "Removed from week view");
                router.refresh();
              })
            }
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-50"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
