import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { lastUpdatedBy } from "@/lib/audit";
import { canDo } from "@/lib/permissions";
import { formatStoreDateTime, utcToStoreLocalInput } from "@/lib/storeTime";
import { weekStartOf } from "@/lib/services/recurrenceService";
import { getScheduleRequestsForWeek } from "@/lib/services/schedulingService";
import { scheduleRequestTypeLabel } from "@/lib/scheduleRequestLabels";
import StatusBadge from "@/components/StatusBadge";
import TaskDetailActions from "@/components/TaskDetailActions";
import TaskEditForm from "@/components/TaskEditForm";
import ActivityLog from "@/components/ActivityLog";
import PageHeader from "@/components/PageHeader";
import { TaskRow } from "@/lib/services/taskService";

function addDaysStr(dateStr: string, days: number): string {
  return new Date(new Date(dateStr + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

export default async function TaskDetailPage({ params }: PageProps<"/task/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const task = db
    .prepare(
      `SELECT t.*, u.name as owner_name, tt.title_es, tt.recurrence_config FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       WHERE t.id = ?`
    )
    .get(id) as (TaskRow & { owner_name: string | null; recurrence_config: string | null }) | undefined;
  if (!task) notFound();

  const title = user.language === "es" && task.title_es ? task.title_es : task.title;

  // Opt-in per template (More > Templates > Edit schedule) for a task like
  // "Create and post schedule" -- since this store builds each week's
  // schedule the week before, "the week being built" is always next week
  // relative to when this task falls, not the week it's due in.
  const templateConfig = task.recurrence_config ? JSON.parse(task.recurrence_config) : {};
  let linkedWeekRequests: ReturnType<typeof getScheduleRequestsForWeek> = [];
  let linkedWeekRange: { start: string; end: string } | null = null;
  if (templateConfig.linkScheduleRequests && task.scheduled_date) {
    const targetWeekStart = addDaysStr(weekStartOf(task.scheduled_date), 7);
    const targetWeekEnd = addDaysStr(targetWeekStart, 6);
    linkedWeekRange = { start: targetWeekStart, end: targetWeekEnd };
    linkedWeekRequests = getScheduleRequestsForWeek(user.storeId, targetWeekStart, targetWeekEnd);
  }

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

      {linkedWeekRange && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Solicitudes para la semana que programa" : "Requests for the week you're scheduling"}
          </p>
          <p className="mb-2 text-xs text-muted">
            {new Date(linkedWeekRange.start + "T12:00:00Z").toLocaleDateString(locale, { month: "short", day: "numeric" })}
            {" – "}
            {new Date(linkedWeekRange.end + "T12:00:00Z").toLocaleDateString(locale, { month: "short", day: "numeric" })}
          </p>
          {linkedWeekRequests.length === 0 ? (
            <p className="text-sm text-muted">{user.language === "es" ? "Nada solicitado para esa semana todavía." : "Nothing requested for that week yet."}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {linkedWeekRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-background px-2.5 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.associate_name}</p>
                    <p className="text-xs text-muted">
                      {scheduleRequestTypeLabel(r.request_type, user.language)}
                      {r.swap_with_name ? ` ↔ ${r.swap_with_name}` : ""} · {r.requested_start_date}
                      {r.swap_with_date ? ` ↔ ${r.swap_with_date}` : ""}
                      {r.requested_end_date && r.requested_end_date !== r.requested_start_date ? ` – ${r.requested_end_date}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} lang={user.language} />
                </div>
              ))}
            </div>
          )}
          <Link href="/more/scheduling" className="mt-2 inline-block text-xs font-semibold text-accent">
            {user.language === "es" ? "Ver todas las solicitudes →" : "View all requests →"}
          </Link>
        </div>
      )}

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
