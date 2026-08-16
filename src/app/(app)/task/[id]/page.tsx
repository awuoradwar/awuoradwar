import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getActivity, lastUpdatedBy } from "@/lib/audit";
import StatusBadge from "@/components/StatusBadge";
import TaskDetailActions from "@/components/TaskDetailActions";
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

  const activity = getActivity("task", id) as Array<{
    id: string;
    action: string;
    actor_name: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }>;
  const last = lastUpdatedBy("task", id) as { actor_name: string | null; created_at: string } | undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/my-shift" lang={user.language} title={title} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} lang={user.language} />
        {task.due_at && <span className="text-xs text-muted">⏰ {new Date(task.due_at).toLocaleString()}</span>}
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
              {last.actor_name || "system"} · {new Date(last.created_at).toLocaleString()}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <TaskDetailActions taskId={task.id} lang={user.language} managers={managers} status={task.status} verificationRequired={!!task.verification_required} />
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Ver actividad" : "View Activity"} ({activity.length})
        </summary>
        <div className="card mt-2 divide-y divide-border">
          {activity.map((a) => (
            <div key={a.id} className="px-3 py-2 text-xs">
              <p className="font-medium">
                {a.action} · {a.actor_name || "system"}
              </p>
              <p className="text-muted">{new Date(a.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
