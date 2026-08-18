import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

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
    const tasks = db
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
    const done = tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
    return { ...area, tasks, done, total: tasks.length };
  });
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
export function resetDueWeeklyCleaningTasks(storeId: string) {
  const db = getDb();
  const now = new Date();
  const todayWeekday = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - todayWeekday);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString();

  db.prepare(
    `UPDATE cleaning_tasks
     SET status = 'ASSIGNED', completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL,
         photo_before_url = NULL, photo_after_url = NULL
     WHERE id IN (
       SELECT ct.id FROM cleaning_tasks ct
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE a.store_id = ? AND ct.frequency = 'WEEKLY' AND ct.weekday = ?
         AND ct.status IN ('COMPLETED','VERIFIED')
         AND (ct.completed_at IS NULL OR ct.completed_at < ?)
     )`
  ).run(storeId, todayWeekday, weekStartIso);
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
