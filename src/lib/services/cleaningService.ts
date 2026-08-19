import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";
import { storeToday, storeDayRangeUtc } from "../storeTime";
import { weekStartOf } from "./recurrenceService";
import { WEEKLY_CLEANING_ROTATION } from "../weeklyCleaningRotation";

export function deleteCleaningTask(taskId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`DELETE FROM cleaning_tasks WHERE id = ?`).run(taskId);
  writeAudit({ entityType: "cleaning_task", entityId: taskId, actor, action: "CANCELLED" });
}

/** Full edit of a cleaning task's own fields -- title, checklist description,
 * frequency/day, and whether an after photo is required. Separate from
 * setCleaningTaskAssociate (who's doing it) and setCleaningAreaOwner (which
 * manager owns the area), which stay their own single-purpose actions. */
export function updateCleaningTask(
  id: string,
  params: { title: string; description: string | null; frequency: "DAILY" | "WEEKLY"; weekday: number | null; photoRequired: boolean },
  actor: SessionUser
) {
  const db = getDb();
  db.prepare(
    `UPDATE cleaning_tasks SET title = ?, description = ?, frequency = ?, weekday = ?, photo_required = ? WHERE id = ?`
  ).run(params.title, params.description, params.frequency, params.weekday, params.photoRequired ? 1 : 0, id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "EDITED", newValue: params });
}

export function setCleaningAreaOwner(areaId: string, ownerId: string | null, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE cleaning_areas SET owner_id = ? WHERE id = ?`).run(ownerId, areaId);
  writeAudit({ entityType: "cleaning_area", entityId: areaId, actor, action: "ASSIGNED", newValue: { owner_id: ownerId } });
}

/** The manager on duty assigns the associate actually doing a specific
 * cleaning task -- separate from (and more granular than) which manager
 * owns the area overall. */
export function setCleaningTaskAssociate(taskId: string, associateName: string | null, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE cleaning_tasks SET associate_name = ? WHERE id = ?`).run(associateName, taskId);
  writeAudit({ entityType: "cleaning_task", entityId: taskId, actor, action: "ASSIGNED", newValue: { associate_name: associateName } });
}

export interface ChecklistItem {
  id: string;
  text: string;
  associate_name: string | null;
  done: number;
}

function getChecklistItems(cleaningTaskId: string): ChecklistItem[] {
  const db = getDb();
  return db
    .prepare(`SELECT id, text, associate_name, done FROM cleaning_task_items WHERE cleaning_task_id = ? ORDER BY sort_order, created_at`)
    .all(cleaningTaskId) as ChecklistItem[];
}

/** Auto-splits a task's free-text checklist description into individually
 * assignable sub-items the first time anyone views it -- so "different
 * associates doing different things on the same task" works immediately
 * for every task already loaded from the chart, without a manager having
 * to manually re-type each sub-item first. Only splits when there's
 * clearly more than one thing listed (comma-separated); a single-item
 * description is left as plain text. Never re-splits once items exist, so
 * it won't fight with anything a manager has since assigned or checked off. */
export function ensureChecklistItems(cleaningTaskId: string, description: string | null): ChecklistItem[] {
  const existing = getChecklistItems(cleaningTaskId);
  if (existing.length > 0 || !description) return existing;
  const parts = description
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return existing;
  const db = getDb();
  const ts = nowIso();
  parts.forEach((text, i) => {
    db.prepare(`INSERT INTO cleaning_task_items (id, cleaning_task_id, text, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      newId(),
      cleaningTaskId,
      text,
      i,
      ts
    );
  });
  return getChecklistItems(cleaningTaskId);
}

export function setChecklistItemAssociate(itemId: string, associateName: string | null, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE cleaning_task_items SET associate_name = ? WHERE id = ?`).run(associateName, itemId);
  writeAudit({ entityType: "cleaning_task_item", entityId: itemId, actor, action: "ASSIGNED", newValue: { associate_name: associateName } });
}

export function toggleChecklistItemDone(itemId: string, done: boolean, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE cleaning_task_items SET done = ? WHERE id = ?`).run(done ? 1 : 0, itemId);
  writeAudit({ entityType: "cleaning_task_item", entityId: itemId, actor, action: done ? "COMPLETED" : "REOPENED" });
}

export interface CleaningTaskDueToday {
  id: string;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
  weekday: number | null;
  frequency: "DAILY" | "WEEKLY";
  status: string;
  associate_name: string | null;
  photo_required: number;
  photo_before_url: string | null;
  photo_after_url: string | null;
  area_name: string;
  area_name_es: string | null;
  owner_id: string | null;
  owner_name: string | null;
  checklistItems: ChecklistItem[];
}

/** Today's cleaning work for the My Shift dashboard -- every DAILY task not
 * yet done, plus WEEKLY tasks whose fixed weekday is today (or that have no
 * fixed day, so they stay live all week), same "today's version of the
 * schedule shows itself" rule the Cleaning page itself uses. A task
 * completed or verified earlier today stays in place too (with its
 * checklist and per-item associates still visible) instead of vanishing the
 * moment it's marked done -- same "confirmed, still right here" behavior
 * already applied to regular tasks on My Shift. */
export function getCleaningTasksDueToday(storeId: string, todayWeekday: number): CleaningTaskDueToday[] {
  const db = getDb();
  const { start, end } = storeDayRangeUtc(storeId, storeToday(storeId));
  const rows = db
    .prepare(
      `SELECT ct.id, ct.title, ct.title_es, ct.description, ct.description_es, ct.weekday, ct.frequency, ct.status,
              ct.associate_name, ct.photo_required, ct.photo_before_url, ct.photo_after_url,
              a.name as area_name, a.name_es as area_name_es, a.owner_id, u.name as owner_name
       FROM cleaning_tasks ct
       JOIN cleaning_areas a ON a.id = ct.area_id
       LEFT JOIN users u ON u.id = a.owner_id
       WHERE a.store_id = ? AND (
         ct.status IN ('ASSIGNED', 'REOPENED')
         OR (ct.status IN ('COMPLETED', 'VERIFIED') AND (
           (ct.completed_at >= ? AND ct.completed_at < ?) OR (ct.verified_at >= ? AND ct.verified_at < ?)
         ))
       )
         AND (ct.frequency = 'DAILY' OR ct.weekday IS NULL OR ct.weekday = ?)
       ORDER BY ct.status IN ('COMPLETED', 'VERIFIED'), a.owner_id IS NULL, a.name`
    )
    .all(storeId, start, end, start, end, todayWeekday) as Array<Omit<CleaningTaskDueToday, "checklistItems">>;
  return rows.map((row) => ({ ...row, checklistItems: ensureChecklistItems(row.id, row.description) }));
}

export function getAreasWithProgress(storeId: string) {
  const db = getDb();
  const areas = db
    .prepare(
      `SELECT a.*, u.name as owner_name FROM cleaning_areas a
       LEFT JOIN users u ON u.id = a.owner_id
       WHERE a.store_id = ? ORDER BY a.category, a.name`
    )
    .all(storeId) as Array<{ id: string; name: string; name_es: string | null; category: string; owner_id: string | null; owner_name: string | null }>;

  return areas.map((area) => {
    const rawTasks = db
      .prepare(`SELECT * FROM cleaning_tasks WHERE area_id = ? ORDER BY created_at ASC`)
      .all(area.id) as Array<{
      id: string;
      title: string;
      title_es: string | null;
      description: string | null;
      description_es: string | null;
      frequency: "DAILY" | "WEEKLY";
      weekday: number | null;
      status: string;
      associate_name: string | null;
      photo_required: number;
      photo_before_url: string | null;
      photo_after_url: string | null;
    }>;
    const tasks = rawTasks.map((task) => ({ ...task, checklistItems: ensureChecklistItems(task.id, task.description) }));
    const done = tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
    return { ...area, tasks, done, total: tasks.length };
  });
}

/** Case-insensitive match on an existing area for this store; creates a new
 * one if nothing matches. Lets a bulk chart import just type area names
 * freeform without first having to pre-create every area by hand. */
export function findOrCreateCleaningArea(storeId: string, name: string, category: "FOH" | "BOH" | "FACILITIES", actor: SessionUser): string {
  const db = getDb();
  const trimmed = name.trim();
  const existing = db.prepare(`SELECT id FROM cleaning_areas WHERE store_id = ? AND lower(name) = lower(?)`).get(storeId, trimmed) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = newId();
  db.prepare(`INSERT INTO cleaning_areas (id, store_id, name, category, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, storeId, trimmed, category, nowIso());
  writeAudit({ entityType: "cleaning_area", entityId: id, actor, action: "CREATED", newValue: { name: trimmed, category } });
  return id;
}

/** Bootstraps the store's real weekly deep-clean rotation the first time
 * anyone opens Cleaning with no areas set up yet -- same "auto-populate an
 * empty store once" pattern as ensureDefaultInventoryItems. Never runs again
 * once any area exists, so it won't fight with what a manager adds or edits
 * afterward. */
export function ensureWeeklyCleaningRotation(storeId: string, actor: SessionUser) {
  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) as n FROM cleaning_areas WHERE store_id = ?`).get(storeId) as { n: number };
  if (existing.n > 0) return;
  loadWeeklyCleaningRotation(storeId, actor);
}

/** Adds any rotation item not already present (matched by title) -- safe to
 * call again after the company chart changes, since it only fills in what's
 * missing and never touches areas/tasks a manager has since edited. */
export function loadWeeklyCleaningRotation(storeId: string, actor: SessionUser): number {
  const db = getDb();
  let added = 0;
  for (const item of WEEKLY_CLEANING_ROTATION) {
    const existingTask = db
      .prepare(
        `SELECT ct.id FROM cleaning_tasks ct JOIN cleaning_areas a ON a.id = ct.area_id WHERE a.store_id = ? AND ct.title = ?`
      )
      .get(storeId, item.title);
    if (existingTask) continue;
    const areaId = findOrCreateCleaningArea(storeId, item.area, item.category, actor);
    createCleaningTask({ areaId, title: item.title, description: item.description, frequency: "WEEKLY", weekday: item.weekday, actor });
    added++;
  }
  return added;
}

export function createCleaningTask(params: {
  areaId: string;
  title: string;
  description?: string;
  frequency?: "DAILY" | "WEEKLY";
  weekday?: number | null;
  associateName?: string;
  managerOwnerId?: string | null;
  photoRequired?: boolean;
  actor: SessionUser;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO cleaning_tasks (id, area_id, title, description, frequency, weekday, associate_name, manager_owner_id, status, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(
    id,
    params.areaId,
    params.title,
    params.description || null,
    params.frequency || "DAILY",
    params.weekday ?? null,
    params.associateName || null,
    params.managerOwnerId || null,
    params.photoRequired ? 1 : 0,
    nowIso()
  );
  writeAudit({ entityType: "cleaning_task", entityId: id, actor: params.actor, action: "CREATED", newValue: { title: params.title } });
  return id;
}

/**
 * Weekly cleaning tasks tied to a specific weekday (e.g. "Cook Range, every
 * Sunday") behave like a recurring checklist, not a one-time task: once that
 * weekday comes back around, a completion from a previous week no longer
 * counts. Safe to call on every page load -- it only resets a task when its
 * due weekday is today AND its last completion predates this week, so it
 * never touches a task that's already been done this week.
 */
/** Clears the per-item checklist state (done + assigned associate) for a
 * batch of tasks being reset -- without this, only the parent task's own
 * status/completed_at got wiped, so "today's fresh checklist" still showed
 * every sub-item checked off with yesterday's associate names still
 * attached, since resetting the task never touched cleaning_task_items at
 * all. */
function resetChecklistItemsForTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  const db = getDb();
  const placeholders = taskIds.map(() => "?").join(",");
  db.prepare(`UPDATE cleaning_task_items SET done = 0, associate_name = NULL WHERE cleaning_task_id IN (${placeholders})`).run(...taskIds);
}

export function resetDueWeeklyCleaningTasks(storeId: string) {
  const db = getDb();
  const todayStr = storeToday(storeId);
  const todayWeekday = new Date(todayStr + "T00:00:00Z").getDay();
  // completed_at is a UTC timestamp -- comparing it against store-local
  // midnight requires the real timezone conversion, not a bare "Z" suffix
  // (which would be off by the store's UTC offset).
  const weekStartIso = storeDayRangeUtc(storeId, weekStartOf(todayStr)).start;

  const dueIds = db
    .prepare(
      `SELECT ct.id FROM cleaning_tasks ct
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE a.store_id = ? AND ct.frequency = 'WEEKLY' AND ct.weekday = ?
         AND ct.status IN ('COMPLETED','VERIFIED')
         AND (ct.completed_at IS NULL OR ct.completed_at < ?)`
    )
    .all(storeId, todayWeekday, weekStartIso) as Array<{ id: string }>;
  if (dueIds.length === 0) return;
  const ids = dueIds.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE cleaning_tasks
     SET status = 'ASSIGNED', completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL,
         photo_before_url = NULL, photo_after_url = NULL
     WHERE id IN (${placeholders})`
  ).run(...ids);
  resetChecklistItemsForTasks(ids);
}

/**
 * A DAILY cleaning task is a fresh checklist every day, not a one-time task:
 * yesterday's completion shouldn't leave it permanently done. Safe to call
 * on every page load -- it only resets a task whose last completion
 * predates today (store-local), so a task already done today stays done.
 */
export function resetDueDailyCleaningTasks(storeId: string) {
  const db = getDb();
  // Same UTC-timestamp-vs-store-local-midnight conversion as above.
  const todayIso = storeDayRangeUtc(storeId, storeToday(storeId)).start;

  const dueIds = db
    .prepare(
      `SELECT ct.id FROM cleaning_tasks ct
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE a.store_id = ? AND ct.frequency = 'DAILY'
         AND ct.status IN ('COMPLETED','VERIFIED')
         AND (ct.completed_at IS NULL OR ct.completed_at < ?)`
    )
    .all(storeId, todayIso) as Array<{ id: string }>;
  if (dueIds.length === 0) return;
  const ids = dueIds.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE cleaning_tasks
     SET status = 'ASSIGNED', completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL,
         photo_before_url = NULL, photo_after_url = NULL
     WHERE id IN (${placeholders})`
  ).run(...ids);
  resetChecklistItemsForTasks(ids);
}

export function completeCleaningTask(id: string, actor: SessionUser, afterPhotoUrl?: string | null) {
  const db = getDb();
  const task = db.prepare(`SELECT photo_required, photo_after_url FROM cleaning_tasks WHERE id = ?`).get(id) as
    | { photo_required: number; photo_after_url: string | null }
    | undefined;
  if (task?.photo_required && !task.photo_after_url && !afterPhotoUrl) {
    throw new Error("PHOTO_REQUIRED: This cleaning task requires an after photo before it can be marked complete.");
  }
  const ts = nowIso();
  db.prepare(
    `UPDATE cleaning_tasks SET status = 'COMPLETED', completed_by = ?, completed_at = ?, photo_after_url = COALESCE(?, photo_after_url) WHERE id = ?`
  ).run(actor.id, ts, afterPhotoUrl || null, id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "COMPLETED", newValue: afterPhotoUrl ? { photo_after_url: afterPhotoUrl } : undefined });
}

/** Attach a before/after photo to a task independent of completion -- every
 * cleaning task can carry documentation photos, not just the ones flagged
 * photo_required. */
export function attachCleaningPhoto(id: string, kind: "before" | "after", photoUrl: string, actor: SessionUser) {
  const db = getDb();
  const column = kind === "before" ? "photo_before_url" : "photo_after_url";
  db.prepare(`UPDATE cleaning_tasks SET ${column} = ? WHERE id = ?`).run(photoUrl, id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "EDITED", newValue: { [column]: photoUrl } });
}

export function verifyCleaningTask(id: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE cleaning_tasks SET status = 'VERIFIED', verified_by = ?, verified_at = ? WHERE id = ?`).run(actor.id, ts, id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "VERIFIED" });
}

/** Scoped to storeId so one store can never fetch another's photo. */
export function getPhotoRefForTask(taskId: string, storeId: string, kind: "before" | "after") {
  const db = getDb();
  const column = kind === "before" ? "photo_before_url" : "photo_after_url";
  return db
    .prepare(
      `SELECT ct.${column} as photo_url FROM cleaning_tasks ct
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE ct.id = ? AND a.store_id = ? AND ct.${column} IS NOT NULL`
    )
    .get(taskId, storeId) as { photo_url: string } | undefined;
}

export function reopenCleaningTask(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE cleaning_tasks SET status = 'REOPENED', completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL WHERE id = ?`).run(id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "REOPENED" });
}
