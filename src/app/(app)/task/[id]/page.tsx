import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { lastUpdatedBy } from "@/lib/audit";
import { canDo } from "@/lib/permissions";
import { formatStoreDateTime, utcToStoreLocalInput } from "@/lib/storeTime";
import StatusBadge from "@/components/StatusBadge";
import TaskDetailActions from "@/components/TaskDetailActions";
import TaskEditForm from "@/components/TaskEditForm";
import ActivityLog from "@/components/ActivityLog";
import PageHeader from "@/components/PageHeader";
import { TaskRow } from "@/lib/services/taskService";

export default async function TaskDetailPage({ params }: PageProps<"/task/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const task = db
    .prepare(
      `SELECT t.*, u.name as owner_name, tt.title_es FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       WHERE t.id = ?`
    )
    .get(id) as (TaskRow & { owner_name: string | null }) | undefined;
  if (!task) notFound();

  const title = user.language === "es" && task.title_es ? task.title_es : task.title;

  const managers = db
    .prepare(`SELECT id, name FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`)
    .all() as Array<{ id: string; name: string }>;

  const last = lastUpdatedBy("task", id) as { actor_name: string | null; created_at: string } | undefined;
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(user.storeId, iso, locale);
  // Local wall-clock split for the edit form's separate date/time inputs --
  // slicing task.due_at's raw UTC digits directly (as this used to) shows
  // the UTC hour as if it were already store-local, which silently drifted
  // the displayed time by the store's UTC offset from what the badge above
  // (correctly run through formatStoreDateTime) shows.
  const dueLocal = task.due_at ? utcToStoreLocalInput(user.storeId, task.due_at) : null;
  const dueDateLocal = dueLocal ? dueLocal.slice(0, 10) : null;
  const dueTimeLocal = dueLocal ? dueLocal.slice(11, 16) : null;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/my-shift" lang={user.language} title={title} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} lang={user.language} />
        {task.due_at && <span className="text-xs text-muted">⏰ {fmt(task.due_at)}</span>}
      </div>
      {task.description && <p className="mt-3 text-sm text-muted">{task.description}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">{user.language === "es" ? "Responsable" : "Owner"}</dt>
        <dd>{task.owner_name || "—"}</dd>
        <dt className="text-muted">{user.language === "es" ? "Área" : "Area"}</dt>
        <dd>{task.area || "—"}</dd>
        <dt className="text-muted">{user.language === "es" ? "Esfuerzo" : "Effort"}</dt>
        <dd>{task.effort}</dd>
        {last && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Última actualización" : "Last updated by"}</dt>
            <dd>
              {last.actor_name || "system"} · {fmt(last.created_at)}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <TaskDetailActions
          taskId={task.id}
          lang={user.language}
          managers={managers}
          status={task.status}
          verificationRequired={!!task.verification_required}
          templateId={task.template_id}
          canManageSeries={canDo(user, "templates.manage")}
        />
      </div>

      {task.status !== "COMPLETE" && task.status !== "CANCELLED" && (
        <TaskEditForm
          taskId={task.id}
          title={task.title}
          description={task.description}
          dueDateLocal={dueDateLocal}
          dueTimeLocal={dueTimeLocal}
          effort={task.effort}
          severity={task.severity}
          lang={user.language}
        />
      )}

      <ActivityLog entityType="task" entityId={id} storeId={user.storeId} lang={user.language} />
    </div>
  );
}
