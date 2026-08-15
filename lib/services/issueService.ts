import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";

export function createIssue(params: {
  storeId: string;
  category: string;
  description: string;
  severity?: "NORMAL" | "CRITICAL";
  ownerId?: string | null;
  actor: SessionUser;
  idempotencyKey?: string;
}) {
  return withIdempotency("issue", params.idempotencyKey, () => insertIssue(params));
}

function insertIssue(params: {
  storeId: string;
  category: string;
  description: string;
  severity?: "NORMAL" | "CRITICAL";
  ownerId?: string | null;
  actor: SessionUser;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO issues (id, store_id, category, description, severity, status, owner_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`
  ).run(id, params.storeId, params.category, params.description, params.severity || "NORMAL", params.ownerId || params.actor.id, params.actor.id, nowIso());
  writeAudit({ entityType: "issue", entityId: id, actor: params.actor, action: "CREATED" });
  return id;
}

export function addIssueUpdate(issueId: string, note: string, actor: SessionUser, newStatus?: string) {
  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO issue_updates (id, issue_id, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, issueId, note, actor.id, nowIso());
  if (newStatus) {
    const old = db.prepare(`SELECT status FROM issues WHERE id = ?`).get(issueId) as { status: string };
    db.prepare(`UPDATE issues SET status = ? WHERE id = ?`).run(newStatus, issueId);
    writeAudit({ entityType: "issue", entityId: issueId, actor, action: "EDITED", oldValue: { status: old?.status }, newValue: { status: newStatus, note } });
  } else {
    writeAudit({ entityType: "issue", entityId: issueId, actor, action: "EDITED", newValue: { note } });
  }
}

export function resolveIssue(issueId: string, resolution: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE issues SET status = 'RESOLVED', resolution = ?, resolved_at = ? WHERE id = ?`).run(resolution, ts, issueId);
  writeAudit({ entityType: "issue", entityId: issueId, actor, action: "COMPLETED", newValue: { resolution } });
}

export function reopenIssue(issueId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE issues SET status = 'REOPENED', resolved_at = NULL WHERE id = ?`).run(issueId);
  writeAudit({ entityType: "issue", entityId: issueId, actor, action: "REOPENED" });
}

export function getOpenIssues(storeId: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM issues WHERE store_id = ? AND status NOT IN ('RESOLVED') ORDER BY severity DESC, created_at DESC`).all(storeId);
}
