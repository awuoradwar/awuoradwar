import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";
import { storeToday, storeLocalHour, storeDayRangeUtc } from "../storeTime";

export type Section = "NOW" | "TODAY" | "THIS_WEEK";

export interface TaskRow {
  id: string;
  store_id: string;
  template_id: string | null;
  title: string;
  title_es: string | null;
  description: string | null;
  area: string | null;
  category: string | null;
  owner_id: string | null;
  owner_name: string | null;
  support_ids: string | null;
  due_at: string | null;
  scheduled_for: string | null;
  scheduled_date: string | null;
  effort: string;
  severity: string;
  status: string;
  verification_required: number;
  verified_by: string | null;
  verified_at: string | null;
  depends_on_task_id: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  checklist_role: string | null;
}

export interface ChecklistSummary {
  total: number;
  done: number;
  remaining: Array<{ id: string; title: string }>;
}

/** Today's Opening Ready / Closing Complete summaries (spec section 19). */
export function getChecklistSummaries(storeId: string, dateStr: string): { opening: ChecklistSummary; closing: ChecklistSummary } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, status, checklist_role FROM tasks
       WHERE store_id = ? AND scheduled_date = ? AND checklist_role IN ('OPENING','CLOSING') AND status != 'CANCELLED'`
    )
    .all(storeId, dateStr) as Array<{ id: string; title: string; status: string; checklist_role: string }>;

  function summarize(role: string): ChecklistSummary {
    const items = rows.filter((r) => r.checklist_role === role);
    const remaining = items.filter((r) => r.status !== "COMPLETE" && r.status !== "VERIFIED");
    return { total: items.length, done: items.length - remaining.length, remaining: remaining.map((r) => ({ id: r.id, title: r.title })) };
  }

  return { opening: summarize("OPENING"), closing: summarize("CLOSING") };
}

export interface SuggestedOwner {
  id: string;
  name: string;
  openCount: number;
}

/**
 * Suggest a delegation owner for a newly-approved import proposal, per spec
 * section 8: "the system may Suggest Delegation based on area, role,
 * workload and due date, but the manager remains the final decision-maker."
 * The lightweight import extractor (see importService.ts) doesn't parse a
 * specific area or role out of free text, so this uses the one factor that
 * is always available -- current open-task workload -- to suggest the
 * least-loaded eligible manager. The caller always presents this as an
 * editable suggestion, never an automatic assignment.
 */
export function suggestOwnerForNewTask(storeId: string): SuggestedOwner | null {
  const db = getDb();
  const managers = db
    .prepare(`SELECT id, name FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`)
    .all() as Array<{ id: string; name: string }>;
  if (managers.length === 0) return null;

  const counts = db
    .prepare(
      `SELECT owner_id, COUNT(*) as c FROM tasks
       WHERE store_id = ? AND status IN ('OPEN','IN_PROGRESS') AND owner_id IS NOT NULL
       GROUP BY owner_id`
    )
    .all(storeId) as Array<{ owner_id: string; c: number }>;
  const countMap = new Map(counts.map((c) => [c.owner_id, c.c]));

  let best = managers[0];
  let bestCount = countMap.get(best.id) || 0;
  for (const m of managers) {
    const c = countMap.get(m.id) || 0;
    if (c < bestCount) {
      best = m;
      bestCount = c;
    }
  }
  return { id: best.id, name: best.name, openCount: bestCount };
}

function isDueToday(task: TaskRow, todayStr: string): boolean {
  // scheduled_date is the authoritative calendar day (set explicitly, store-timezone-correct);
  // due_at is a real UTC instant and its raw date slice can land on the wrong side of
  // midnight UTC for a late store-local due time, so only fall back to it when there's
  // no scheduled_date at all.
  if (task.scheduled_date) return task.scheduled_date === todayStr;
  if (task.due_at) return storeToday(task.store_id, new Date(task.due_at)) === todayStr;
  return task.scheduled_for === "TODAY" || task.scheduled_for === "NEXT_SHIFT";
}

/** dueToday gates the overdue path so a still-open instance from an earlier day
 * this week (recurring tasks materialize for the whole week up front) doesn't
 * sit in NOW forever just because it's long past due -- only today's own tasks
 * escalate on lateness. CRITICAL severity always escalates regardless of day. */
function isUrgentNow(task: TaskRow, nowDate: Date, dueToday: boolean): boolean {
  if (task.severity === "CRITICAL") return true;
  if (!task.due_at || !dueToday) return false;
  const hoursUntil = (new Date(task.due_at).getTime() - nowDate.getTime()) / 3600000;
  return hoursUntil <= 2; // overdue or imminent
}

/** Store's two shift windows: Morning (open-5pm) and Evening (5pm-11:45pm close). A double spans both. */
type ShiftWindow = "MORNING" | "EVENING";
const EVENING_START_HOUR = 17;

/** The viewer's actual scheduled shift for today, if the GM has planned one
 * (see scheduleService.getShiftTypeForUserToday) -- null when unscheduled. */
export type ViewerShiftType = "MORNING" | "EVENING" | "DOUBLE" | null;

export function windowForHour(hour: number): ShiftWindow {
  return hour < EVENING_START_HOUR ? "MORNING" : "EVENING";
}

/**
 * Whether a timed task's due time falls within this viewer's current shift
 * window. When the GM has scheduled them for a specific shift today, that
 * schedule wins outright -- a DOUBLE always matches (they're on for the
 * whole day), MORNING/EVENING only matches tasks due in that window,
 * regardless of the wall-clock hour right now. Unscheduled viewers fall back
 * to comparing against the actual current time.
 */
function isDueThisShiftWindow(task: TaskRow, nowDate: Date, viewerShiftType: ViewerShiftType): boolean {
  if (!task.due_at) return false;
  if (viewerShiftType === "DOUBLE") return true;
  const taskWindow = windowForHour(storeLocalHour(task.store_id, new Date(task.due_at)));
  if (viewerShiftType === "MORNING" || viewerShiftType === "EVENING") return taskWindow === viewerShiftType;
  return taskWindow === windowForHour(storeLocalHour(task.store_id, nowDate));
}

/**
 * Dashboard section for a task, from this viewer's point of view. Recurring
 * tasks are no longer split into their own bucket -- they flow into
 * NOW/TODAY/THIS_WEEK by their actual scheduled day and time, same as any
 * other task:
 *  - NOW: this viewer's responsibility (owner, or unassigned while they're
 *    PIC), due today, and (when it has a specific time) scheduled within the
 *    current shift window -- or urgent/overdue for anyone.
 *  - TODAY: due today store-wide, but not this viewer's right now (not
 *    theirs, or theirs but scheduled for the other shift window).
 *  - THIS_WEEK: everything else due later this week.
 */
export function computeSection(
  task: TaskRow,
  viewerId: string,
  picUserId: string | null,
  nowDate: Date,
  todayStr: string,
  viewerShiftType: ViewerShiftType = null
): Section {
  const dueToday = isDueToday(task, todayStr);
  if (isUrgentNow(task, nowDate, dueToday)) return "NOW";

  const mine = task.owner_id ? task.owner_id === viewerId : picUserId === viewerId;

  if (mine && dueToday) {
    if (!task.due_at || isDueThisShiftWindow(task, nowDate, viewerShiftType)) return "NOW";
    return "TODAY";
  }
  if (dueToday) return "TODAY";
  return "THIS_WEEK";
}

export function isBlocked(task: TaskRow): boolean {
  if (!task.depends_on_task_id) return false;
  const db = getDb();
  const dep = db.prepare(`SELECT status FROM tasks WHERE id = ?`).get(task.depends_on_task_id) as
    | { status: string }
    | undefined;
  return !!dep && dep.status !== "COMPLETE";
}

export function getOpenTasksForStore(storeId: string): TaskRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, u.name as owner_name, tt.title_es FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       WHERE t.store_id = ? AND t.status IN ('OPEN','IN_PROGRESS')
       ORDER BY t.due_at IS NULL, t.due_at ASC`
    )
    .all(storeId) as TaskRow[];
}

/** Same as getOpenTasksForStore, but a task completed earlier today stays
 * in the list (in whatever NOW/TODAY/THIS_WEEK spot it already had) instead
 * of vanishing the moment it's marked done -- tapping Complete should read
 * as "confirmed, still right here," not "poof, go dig it out of a
 * different collapsed section to be sure it saved." */
export function getMyShiftTasks(storeId: string, todayStr: string): TaskRow[] {
  const db = getDb();
  const { start, end } = storeDayRangeUtc(storeId, todayStr);
  return db
    .prepare(
      `SELECT t.*, u.name as owner_name, tt.title_es FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       WHERE t.store_id = ? AND (t.status IN ('OPEN','IN_PROGRESS') OR (t.status = 'COMPLETE' AND t.completed_at >= ? AND t.completed_at < ?))
       ORDER BY t.due_at IS NULL, t.due_at ASC`
    )
    .all(storeId, start, end) as TaskRow[];
}

export interface CompletedTaskRow extends TaskRow {
  completed_by_name: string | null;
}

/** Everything completed today, most recent first -- the record of what actually got done. */
export function getCompletedTasksToday(storeId: string, todayStr: string): CompletedTaskRow[] {
  const db = getDb();
  const { start, end } = storeDayRangeUtc(storeId, todayStr);
  return db
    .prepare(
      `SELECT t.*, u.name as owner_name, tt.title_es, cu.name as completed_by_name FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       LEFT JOIN users cu ON cu.id = t.completed_by
       WHERE t.store_id = ? AND t.status = 'COMPLETE' AND t.completed_at >= ? AND t.completed_at < ?
       ORDER BY t.completed_at DESC`
    )
    .all(storeId, start, end) as CompletedTaskRow[];
}

export function getWeekTasks(storeId: string, weekStart: string, weekEnd: string): TaskRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, u.name as owner_name, tt.title_es FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       WHERE t.store_id = ? AND t.scheduled_date BETWEEN ? AND ? AND t.status != 'CANCELLED'
       ORDER BY t.scheduled_date ASC, t.due_at IS NULL, t.due_at ASC`
    )
    .all(storeId, weekStart, weekEnd) as TaskRow[];
}

export function createTask(params: {
  storeId: string;
  title: string;
  description?: string;
  area?: string;
  category?: string;
  ownerId?: string | null;
  supportIds?: string[];
  dueAt?: string | null;
  scheduledFor?: string;
  scheduledDate?: string;
  effort?: string;
  severity?: string;
  actor: SessionUser;
  idempotencyKey?: string;
}): string {
  return withIdempotency("task", params.idempotencyKey, () => insertTask(params));
}

function insertTask(params: {
  storeId: string;
  title: string;
  description?: string;
  area?: string;
  category?: string;
  ownerId?: string | null;
  supportIds?: string[];
  dueAt?: string | null;
  scheduledFor?: string;
  scheduledDate?: string;
  effort?: string;
  severity?: string;
  actor: SessionUser;
}): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO tasks (id, store_id, title, description, area, category, owner_id, support_ids, due_at,
      scheduled_for, scheduled_date, effort, priority, severity, status, verification_required, source,
      created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?, 'OPEN', 0, 'manual', ?, ?)`
  ).run(
    id,
    params.storeId,
    params.title,
    params.description || null,
    params.area || null,
    params.category || null,
    params.ownerId || null,
    params.supportIds ? JSON.stringify(params.supportIds) : null,
    params.dueAt || null,
    params.scheduledFor || "TODAY",
    params.scheduledDate || storeToday(params.storeId),
    params.effort || "STANDARD",
    params.severity || "NORMAL",
    params.actor.id,
    nowIso()
  );
  writeAudit({
    entityType: "task",
    entityId: id,
    actor: params.actor,
    action: "CREATED",
    newValue: { title: params.title },
  });
  return id;
}

/** Edit a task's own fields (title, description, due date/time, effort,
 * severity) -- distinct from reassign/carry-forward/cancel, which change
 * status/ownership/scheduling but never the task's content. GM and any
 * manager may correct a mistake or update details after creation. */
export function updateTask(
  taskId: string,
  params: { title: string; description?: string | null; dueAt?: string | null; effort: string; severity: string },
  actor: SessionUser
) {
  const db = getDb();
  const task = db.prepare(`SELECT title, description, due_at, effort, severity FROM tasks WHERE id = ?`).get(taskId) as
    | { title: string; description: string | null; due_at: string | null; effort: string; severity: string }
    | undefined;
  if (!task) throw new Error("Task not found");
  const ts = nowIso();
  db.prepare(
    `UPDATE tasks SET title = ?, description = ?, due_at = ?, effort = ?, severity = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`
  ).run(params.title, params.description || null, params.dueAt || null, params.effort, params.severity, actor.id, ts, taskId);
  writeAudit({
    entityType: "task",
    entityId: taskId,
    actor,
    action: "EDITED",
    oldValue: task,
    newValue: params,
  });
}

export function completeTask(taskId: string, actor: SessionUser, picId: string | null) {
  const db = getDb();
  const task = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as TaskRow | undefined;
  if (!task) throw new Error("Task not found");
  if (isBlocked(task)) throw new Error("BLOCKED: dependency not yet complete");
  const ts = nowIso();
  db.prepare(
    `UPDATE tasks SET status = 'COMPLETE', completed_by = ?, completed_at = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`
  ).run(actor.id, ts, actor.id, ts, taskId);
  writeAudit({
    entityType: "task",
    entityId: taskId,
    actor,
    picId,
    action: "COMPLETED",
    oldValue: { status: task.status },
    newValue: { status: "COMPLETE" },
  });
}

export function verifyTask(taskId: string, actor: SessionUser, picId: string | null) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE tasks SET verified_by = ?, verified_at = ? WHERE id = ?`).run(actor.id, ts, taskId);
  writeAudit({ entityType: "task", entityId: taskId, actor, picId, action: "VERIFIED" });
}

export function reassignTask(taskId: string, newOwnerId: string, actor: SessionUser) {
  const db = getDb();
  const task = db.prepare(`SELECT owner_id FROM tasks WHERE id = ?`).get(taskId) as { owner_id: string | null };
  const ts = nowIso();
  db.prepare(`UPDATE tasks SET owner_id = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`).run(
    newOwnerId,
    actor.id,
    ts,
    taskId
  );
  writeAudit({
    entityType: "task",
    entityId: taskId,
    actor,
    action: "ASSIGNED",
    oldValue: { owner_id: task.owner_id },
    newValue: { owner_id: newOwnerId },
  });
}

export function carryForwardTask(taskId: string, newScheduledDate: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE tasks SET scheduled_date = ?, status = 'OPEN', last_edited_by = ?, last_edited_at = ? WHERE id = ?`
  ).run(newScheduledDate, actor.id, ts, taskId);
  writeAudit({
    entityType: "task",
    entityId: taskId,
    actor,
    action: "CARRIED_FORWARD",
    newValue: { scheduled_date: newScheduledDate },
  });
}

export function cancelTask(taskId: string, reason: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE tasks SET status = 'CANCELLED', cancel_reason = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`
  ).run(reason, actor.id, ts, taskId);
  writeAudit({ entityType: "task", entityId: taskId, actor, action: "CANCELLED", newValue: { reason } });
}

/** Cancel a whole recurring series, not just today's instance: turns the
 * template off (so ensureInstancesForDate stops generating new ones) and
 * cancels every not-yet-resolved instance it already generated, past or
 * future. Distinct from cancelTask, which only ever touches the one row
 * the manager is looking at. */
export function cancelTaskSeries(templateId: string, reason: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE task_templates SET active = 0 WHERE id = ?`).run(templateId);
  const openInstances = db
    .prepare(`SELECT id FROM tasks WHERE template_id = ? AND status NOT IN ('COMPLETE', 'CANCELLED')`)
    .all(templateId) as Array<{ id: string }>;
  for (const instance of openInstances) {
    db.prepare(
      `UPDATE tasks SET status = 'CANCELLED', cancel_reason = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`
    ).run(reason, actor.id, ts, instance.id);
    writeAudit({ entityType: "task", entityId: instance.id, actor, action: "CANCELLED", newValue: { reason, series: true } });
  }
  writeAudit({ entityType: "task_template", entityId: templateId, actor, action: "EDITED", newValue: { active: false, reason } });
}

/** Whether an active recurring template already exists with this title at
 * this store -- catches the accidental double-add (same task typed twice,
 * or added both from Quick Log and the Templates page) that otherwise shows
 * up as the same task appearing twice, every day, forever. Case-insensitive
 * since "Complete WorkJam Tasks" and "complete workjam tasks" are the same
 * mistake to a manager typing fast. */
export function activeTemplateTitleExists(storeId: string, title: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT id FROM task_templates WHERE store_id = ? AND active = 1 AND lower(title) = lower(?)`)
    .get(storeId, title.trim());
  return !!row;
}
