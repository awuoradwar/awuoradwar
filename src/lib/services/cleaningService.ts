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
      .all(area.id) as Array<{ id: string; title: string; title_es: string | null; status: string; associate_name: string | null; photo_required: number; photo_url: string | null }>;
    const done = tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
    return { ...area, tasks, done, total: tasks.length };
  });
}

export function createCleaningTask(params: {
  areaId: string;
  title: string;
  associateName?: string;
  managerOwnerId?: string | null;
  photoRequired?: boolean;
  actor: SessionUser;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO cleaning_tasks (id, area_id, title, associate_name, manager_owner_id, status, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(id, params.areaId, params.title, params.associateName || null, params.managerOwnerId || null, params.photoRequired ? 1 : 0, nowIso());
  writeAudit({ entityType: "cleaning_task", entityId: id, actor: params.actor, action: "CREATED", newValue: { title: params.title } });
  return id;
}

export function completeCleaningTask(id: string, actor: SessionUser, photoUrl?: string | null) {
  const db = getDb();
  const task = db.prepare(`SELECT photo_required FROM cleaning_tasks WHERE id = ?`).get(id) as { photo_required: number } | undefined;
  if (task?.photo_required && !photoUrl) {
    throw new Error("PHOTO_REQUIRED: This cleaning task requires a photo before it can be marked complete.");
  }
  const ts = nowIso();
  db.prepare(`UPDATE cleaning_tasks SET status = 'COMPLETED', completed_by = ?, completed_at = ?, photo_url = COALESCE(?, photo_url) WHERE id = ?`).run(
    actor.id,
    ts,
    photoUrl || null,
    id
  );
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "COMPLETED", newValue: photoUrl ? { photo_url: photoUrl } : undefined });
}

export function verifyCleaningTask(id: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE cleaning_tasks SET status = 'VERIFIED', verified_by = ?, verified_at = ? WHERE id = ?`).run(actor.id, ts, id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "VERIFIED" });
}

/** Scoped to storeId so one store can never fetch another's photo. */
export function getPhotoRefForTask(taskId: string, storeId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ct.photo_url FROM cleaning_tasks ct
       JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE ct.id = ? AND a.store_id = ? AND ct.photo_url IS NOT NULL`
    )
    .get(taskId, storeId) as { photo_url: string } | undefined;
}

export function reopenCleaningTask(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE cleaning_tasks SET status = 'REOPENED', completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL WHERE id = ?`).run(id);
  writeAudit({ entityType: "cleaning_task", entityId: id, actor, action: "REOPENED" });
}
