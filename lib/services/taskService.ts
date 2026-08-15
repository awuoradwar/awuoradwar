import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";

export type Bucket = "NOW" | "THIS_SHIFT" | "TODAY" | "THIS_WEEK";

export interface TaskRow {
  id: string;
  store_id: string;
  template_id: string | null;
  title: string;
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

export function computeBucket(task: TaskRow, nowDate: Date, todayStr: string): Bucket {
  if (task.severity === "CRITICAL") return "NOW";
  if (task.due_at) {
    const due = new Date(task.due_at);
    const hoursUntil = (due.getTime() - nowDate.getTime()) / 3600000;
    if (hoursUntil <= 2) return "NOW"; // overdue or imminent
    const dueDay = task.due_at.slice(0, 10);
    if (dueDay === todayStr) return "THIS_SHIFT";
    return "THIS_WEEK";
  }
  if (task.scheduled_date === todayStr || task.scheduled_for === "TODAY" || task.scheduled_for === "NEXT_SHIFT") {
    return "TODAY";
  }
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
      `SELECT t.*, u.name as owner_name FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
       WHERE t.store_id = ? AND t.status IN ('OPEN','IN_PROGRESS')
       ORDER BY t.due_at IS NULL, t.due_at ASC`
    )
    .all(storeId) as TaskRow[];
}

export function getWeekTasks(storeId: string, weekStart: string, weekEnd: string): TaskRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, u.name as owner_name FROM tasks t
       LEFT JOIN users u ON u.id = t.owner_id
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
    params.scheduledDate || new Date().toISOString().slice(0, 10),
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
