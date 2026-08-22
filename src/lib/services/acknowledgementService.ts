import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export function createAcknowledgement(params: {
  storeId: string;
  title: string;
  source?: string;
  requiredAssociates: string[];
  responsibleManagerId?: string | null;
  actor: SessionUser;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO acknowledgements (id, store_id, title, source, required_associates, responsible_manager_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.storeId, params.title, params.source || null, JSON.stringify(params.requiredAssociates), params.responsibleManagerId || params.actor.id, params.actor.id, nowIso());
  const insertCompletion = db.prepare(
    `INSERT INTO acknowledgement_completions (id, acknowledgement_id, associate_name, completed) VALUES (?, ?, ?, 0)`
  );
  for (const name of params.requiredAssociates) insertCompletion.run(newId(), id, name);
  writeAudit({ entityType: "acknowledgement", entityId: id, actor: params.actor, action: "CREATED" });
  return id;
}

export function markCompletion(completionId: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE acknowledgement_completions SET completed = 1, completed_at = ? WHERE id = ?`).run(ts, completionId);
  writeAudit({ entityType: "acknowledgement_completion", entityId: completionId, actor, action: "COMPLETED" });
}

export function verifyCompletion(completionId: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE acknowledgement_completions SET verified_by = ?, verified_at = ? WHERE id = ?`).run(actor.id, ts, completionId);
  writeAudit({ entityType: "acknowledgement_completion", entityId: completionId, actor, action: "VERIFIED" });
}

export function getAcknowledgementsWithStatus(storeId: string) {
  const db = getDb();
  const acks = db.prepare(`SELECT a.*, u.name as manager_name FROM acknowledgements a LEFT JOIN users u ON u.id = a.responsible_manager_id WHERE a.store_id = ? ORDER BY a.created_at DESC`).all(storeId) as Array<{ id: string; title: string }>;
  return acks.map((a) => {
    const completions = db
      .prepare(
        `SELECT c.*, u.name as verified_by_name FROM acknowledgement_completions c LEFT JOIN users u ON u.id = c.verified_by WHERE c.acknowledgement_id = ?`
      )
      .all(a.id) as Array<{ completed: number }>;
    const outstanding = completions.filter((c) => !c.completed).length;
    return { ...a, completions, outstanding, total: completions.length };
  });
}
