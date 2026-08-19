import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { SessionUser } from "./types";

export type AuditAction =
  | "CREATED"
  | "EDITED"
  | "ASSIGNED"
  | "APPROVED"
  | "VERIFIED"
  | "COMPLETED"
  | "REOPENED"
  | "CANCELLED"
  | "CARRIED_FORWARD"
  | "ACKNOWLEDGED"
  | "DENIED"
  | "SETTLED"
  | "DELETED";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

/**
 * Append-only audit log write. Every material mutation in every service
 * calls this. Never update or delete rows in audit_events.
 */
export function writeAudit(params: {
  entityType: string;
  entityId: string;
  actor: SessionUser | null;
  picId?: string | null;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_events (id, entity_type, entity_id, actor_id, actor_role, pic_id, action, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId(),
    params.entityType,
    params.entityId,
    params.actor?.id ?? null,
    params.actor?.position ?? null,
    params.picId ?? null,
    params.action,
    params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
    params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
    nowIso()
  );
}

/**
 * Idempotent create helper. If `idempotencyKey` has been seen before,
 * returns the entity id from the first successful write instead of
 * running `create` again -- this is what guarantees "retry produces
 * exactly one server record" for the offline queue.
 */
export function withIdempotency(entityType: string, idempotencyKey: string | undefined | null, create: () => string): string {
  if (!idempotencyKey) return create();
  const db = getDb();
  const existing = db
    .prepare(`SELECT entity_id FROM idempotency_keys WHERE idempotency_key = ?`)
    .get(idempotencyKey) as { entity_id: string } | undefined;
  if (existing) return existing.entity_id;
  const entityId = create();
  db.prepare(
    `INSERT OR IGNORE INTO idempotency_keys (idempotency_key, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)`
  ).run(idempotencyKey, entityType, entityId, nowIso());
  return entityId;
}

export function getActivity(entityType: string, entityId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ae.*, u.name as actor_name
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at ASC`
    )
    .all(entityType, entityId);
}

export function lastUpdatedBy(entityType: string, entityId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ae.*, u.name as actor_name
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(entityType, entityId);
}
