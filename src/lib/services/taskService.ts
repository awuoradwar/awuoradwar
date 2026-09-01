import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";
import { storeToday, storeLocalHour, storeDayRangeUtc } from "../storeTime";

export type Section = "NOW" | "OVERDUE" | "TODAY" | "THIS_WEEK";

export interface TaskRow {
  id: string;
  store_id: string;
  template_id: string | null;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
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

/** dueToday gates the overdue path so a still-open RECURRING instance from an
 * earlier day this week (recurring tasks materialize for the whole week up
 * front) doesn't sit in NOW forever just because it's long past due -- only
 * today's own recurring tasks escalate on lateness. A one-off task (no
 * template_id) has no such "materialized ahead of time" excuse -- if it's
 * genuinely overdue from an earlier day, it escalates regardless, so it
 * doesn't quietly sink into This Week forever just because "today" moved on
 * without it. CRITICAL severity always escalates regardless of day. */
function isUrgentNow(task: TaskRow, nowDate: Date, dueToday: boolean): boolean {
  if (task.severity === "CRITICAL") return true;
  if (!task.due_at) return false;
  const hoursUntil = (new Date(task.due_at).getTime() - nowDate.getTime()) / 3600000;
  if (dueToday) return hoursUntil <= 2; // overdue or imminent
  return !task.template_id && hoursUntil < 0;
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
 *    current shift window -- or urgent/overdue for anyone who's actually
 *    working today (CRITICAL severity escalates for absolutely everyone
 *    regardless, same as an issue or borrowed item would).
 *  - TODAY: due today store-wide, but not this viewer's right now (not
 *    theirs, or theirs but scheduled for the other shift window, or urgent
 *    but this viewer isn't on shift today to act on it).
 *  - OVERDUE: scheduled for a day before today and still open -- getMyShiftTasks
 *    never drops an unfinished task no matter how old, so without this check
 *    these fall through to THIS_WEEK and get mislabeled as upcoming planning
 *    items instead of flagged as missed.
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
  const mine = task.owner_id ? task.owner_id === viewerId : picUserId === viewerId;
  // "Anything urgent, whoever it belongs to" only earns a spot in this
  // viewer's personal NOW section when they're actually working the shift
  // window that task's due time falls into -- being scheduled this morning
  // doesn't make another manager's 11pm task this viewer's problem to see
  // on their way out the door. isDueThisShiftWindow is the same window
  // match the "mine && dueToday" branch below already uses; it's only safe
  // to call here with viewerShiftType passed through untouched (never
  // substituting null) since its own null-fallback compares against the
  // CURRENT wall-clock window instead, which would wrongly let a viewer with
  // no schedule entry at all see live urgent tasks anyway. It's never
  // hidden either way: off that condition, it still lands in TODAY
  // (store-wide) below if due today.
  const viewerWorkingThisWindow = mine || (viewerShiftType !== null && isDueThisShiftWindow(task, nowDate, viewerShiftType));
  if (isUrgentNow(task, nowDate, dueToday) && (viewerWorkingThisWindow || task.severity === "CRITICAL")) return "NOW";

  if (mine && dueToday) {
    if (!task.due_at || isDueThisShiftWindow(task, nowDate, viewerShiftType)) return "NOW";
    return "TODAY";
  }
  if (dueToday) return "TODAY";
  if (task.scheduled_date && task.scheduled_date < todayStr) return "OVERDUE";
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
      `SELECT t.*, u.name as owner_name,
              COALESCE(t.title_es, tt.title_es) as title_es
       FROM tasks t
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
      `SELECT t.*, u.name as owner_name,
              COALESCE(t.title_es, tt.title_es) as title_es
       FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       LEFT JOIN task_templates tt ON tt.id = t.template_id
       WHERE t.store_id = ? AND (t.status IN ('OPEN','IN_PROGRESS') OR (t.status = 'COMPLETE' AND t.completed_at >= ? AND t.completed_at < ?))
       ORDER BY t.status = 'COMPLETE', t.due_at IS NULL, t.due_at ASC`
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
      `SELECT t.*, u.name as owner_name,
              COALESCE(t.title_es, tt.title_es) as title_es,
              cu.name as completed_by_name
       FROM tasks t
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
      `SELECT t.*, u.name as owner_name,
              COALESCE(t.title_es, tt.title_es) as title_es
       FROM tasks t
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
  titleEs?: string;
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
  titleEs?: string;
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
    `INSERT INTO tasks (id, store_id, title, title_es, description, area, category, owner_id, support_ids, due_at,
      scheduled_for, scheduled_date, effort, priority, severity, status, verification_required, source,
      created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?, 'OPEN', 0, 'manual', ?, ?)`
  ).run(
    id,
    params.storeId,
    params.title,
    params.titleEs || null,
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
  params: {
    title: string;
    titleEs?: string | null;
    description?: string | null;
    descriptionEs?: string | null;
    dueAt?: string | null;
    scheduledDate?: string | null;
    effort: string;
    severity: string;
  },
  actor: SessionUser
) {
  const db = getDb();
  const task = db.prepare(`SELECT title, description, due_at, scheduled_date, effort, severity FROM tasks WHERE id = ?`).get(taskId) as
    | { title: string; description: string | null; due_at: string | null; scheduled_date: string | null; effort: string; severity: string }
    | undefined;
  if (!task) throw new Error("Task not found");
  const ts = nowIso();
  // scheduled_date decides which day's list a task shows under, independently
  // of due_at -- keep it in lockstep with the due date whenever one is set so
  // editing "the date" on the task actually moves it, matching what a manager
  // sees in the edit form (a single date field, not two).
  db.prepare(
    `UPDATE tasks SET title = ?, title_es = ?, description = ?, description_es = ?, due_at = ?, scheduled_date = COALESCE(?, scheduled_date), effort = ?, severity = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`
  ).run(
    params.title,
    params.titleEs || null,
    params.description || null,
    params.descriptionEs || null,
    params.dueAt || null,
    params.scheduledDate || null,
    params.effort,
    params.severity,
    actor.id,
    ts,
    taskId
  );
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

/** A manager picking a new owner is a deliberate decision -- once reassigned,
 * this task is no longer "whoever the schedule resolver says," so it's
 * excluded from future automatic re-resolution when the schedule changes
 * (see scheduleService.resyncAutoAssignedTaskOwners). */
export function reassignTask(taskId: string, newOwnerId: string, actor: SessionUser) {
  const db = getDb();
  const task = db.prepare(`SELECT owner_id FROM tasks WHERE id = ?`).get(taskId) as { owner_id: string | null };
  const ts = nowIso();
  db.prepare(`UPDATE tasks SET owner_id = ?, owner_auto_assigned = 0, last_edited_by = ?, last_edited_at = ? WHERE id = ?`).run(
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

/** Set (or clear, passing null) the one optional second person helping on
 * this task -- distinct from the Owner, who it's really on. Stored in the
 * same support_ids column the schema already had room for, just always
 * holding at most one id for now rather than the general list the column
 * name implies. */
export function setTaskSupport(taskId: string, supportId: string | null, actor: SessionUser) {
  const db = getDb();
  const task = db.prepare(`SELECT support_ids FROM tasks WHERE id = ?`).get(taskId) as { support_ids: string | null };
  const ts = nowIso();
  db.prepare(`UPDATE tasks SET support_ids = ?, last_edited_by = ?, last_edited_at = ? WHERE id = ?`).run(
    supportId ? JSON.stringify([supportId]) : null,
    actor.id,
    ts,
    taskId
  );
  writeAudit({
    entityType: "task",
    entityId: taskId,
    actor,
    action: "EDITED",
    oldValue: { support_ids: task.support_ids },
    newValue: { support_ids: supportId ? [supportId] : null },
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

export interface TaskNote {
  id: string;
  note: string;
  created_by_name: string | null;
  created_at: string;
}

/** Newest first -- same reading order as every other history/notes list in
 * the app. */
export function getTaskNotes(taskId: string): TaskNote[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT tn.id, tn.note, u.name as created_by_name, tn.created_at
       FROM task_notes tn LEFT JOIN users u ON u.id = tn.created_by
       WHERE tn.task_id = ? ORDER BY tn.created_at DESC`
    )
    .all(taskId) as TaskNote[];
}

export function addTaskNote(taskId: string, note: string, actor: SessionUser): string {
  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO task_notes (id, task_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, taskId, note, actor.id, nowIso());
  writeAudit({ entityType: "task", entityId: taskId, actor, action: "EDITED", newValue: { note } });
  return id;
}

/** Which of these task ids have at least one note -- used to flag a task in
 * a list (e.g. Weekly Summary's Still Open tile) without loading every
 * note's full text just to know whether one exists. */
export function taskIdsWithNotes(taskIds: string[]): Set<string> {
  if (taskIds.length === 0) return new Set();
  const db = getDb();
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT DISTINCT task_id FROM task_notes WHERE task_id IN (${placeholders})`).all(...taskIds) as Array<{ task_id: string }>;
  return new Set(rows.map((r) => r.task_id));
}
