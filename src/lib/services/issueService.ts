import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";

export function createIssue(params: {
  storeId: string;
  category: string;
  description: string;
  severity?: "NORMAL" | "CRITICAL";
  dueDate?: string | null;
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
  dueDate?: string | null;
  ownerId?: string | null;
  actor: SessionUser;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO issues (id, store_id, category, description, severity, status, due_date, owner_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.category,
    params.description,
    params.severity || "NORMAL",
    params.dueDate || null,
    params.ownerId || params.actor.id,
    params.actor.id,
    nowIso()
  );
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

export interface WorkOrderRow {
  id: string;
  category: string;
  description: string;
  severity: string;
  status: string;
  due_date: string | null;
  owner_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface WorkOrderGroups {
  needsFollowUp: WorkOrderRow[];
  dueToday: WorkOrderRow[];
  dueThisWeek: WorkOrderRow[];
  noDate: WorkOrderRow[];
  done: WorkOrderRow[];
}

/**
 * Work orders (equipment/facilities/operational issues) grouped for the
 * dedicated Work Orders view: what's waiting on someone else, what's due
 * today or this week, what has no target date, and what's already done.
 * WAITING status doubles as "needs follow-up" -- it always surfaces there
 * regardless of due date, since that's the point of the status.
 */
export function getWorkOrdersGrouped(storeId: string, todayStr: string, weekEndStr: string): WorkOrderGroups {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.id, i.category, i.description, i.severity, i.status, i.due_date, i.resolved_at, i.created_at,
              u.name as owner_name
       FROM issues i LEFT JOIN users u ON u.id = i.owner_id
       WHERE i.store_id = ?
       ORDER BY i.severity DESC, i.due_date IS NULL, i.due_date ASC, i.created_at DESC`
    )
    .all(storeId) as WorkOrderRow[];

  const groups: WorkOrderGroups = { needsFollowUp: [], dueToday: [], dueThisWeek: [], noDate: [], done: [] };
  for (const row of rows) {
    if (row.status === "RESOLVED") {
      groups.done.push(row);
    } else if (row.status === "WAITING") {
      groups.needsFollowUp.push(row);
    } else if (row.due_date && row.due_date <= todayStr) {
      groups.dueToday.push(row); // includes overdue
    } else if (row.due_date && row.due_date <= weekEndStr) {
      groups.dueThisWeek.push(row);
    } else {
      groups.noDate.push(row);
    }
  }
  return groups;
}
