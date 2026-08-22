import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";
import { createTask } from "./taskService";

export function createGuestRecovery(params: {
  storeId: string;
  contactChannel: "PHONE" | "IN_STORE";
  orderChannel: "ONLINE" | "IN_STORE" | "DRIVE_THRU";
  issueCategory: string;
  description?: string;
  itemDescription?: string;
  guestName?: string;
  valueEstimate?: number | null;
  actor: SessionUser;
  picId?: string | null;
  idempotencyKey?: string;
}) {
  return withIdempotency("guest_recovery", params.idempotencyKey, () => insertGuestRecovery(params));
}

function insertGuestRecovery(params: {
  storeId: string;
  contactChannel: "PHONE" | "IN_STORE";
  orderChannel: "ONLINE" | "IN_STORE" | "DRIVE_THRU";
  issueCategory: string;
  description?: string;
  itemDescription?: string;
  guestName?: string;
  valueEstimate?: number | null;
  actor: SessionUser;
  picId?: string | null;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO guest_recoveries (id, store_id, contact_channel, order_channel, issue_category, description,
      item_description, guest_name, value_estimate, replacement_status, created_by, pic_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.contactChannel,
    params.orderChannel,
    params.issueCategory,
    params.description || null,
    params.itemDescription || null,
    params.guestName || null,
    params.valueEstimate ?? null,
    params.actor.id,
    params.picId || null,
    nowIso()
  );
  writeAudit({ entityType: "guest_recovery", entityId: id, actor: params.actor, picId: params.picId, action: "CREATED" });
  return id;
}

export function approveReplacement(id: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE guest_recoveries SET replacement_status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ?`).run(actor.id, ts, id);
  writeAudit({ entityType: "guest_recovery", entityId: id, actor, action: "APPROVED" });
}

export function completeReplacement(id: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE guest_recoveries SET replacement_status = 'COMPLETED', completed_by = ?, completed_at = ? WHERE id = ?`).run(actor.id, ts, id);
  writeAudit({ entityType: "guest_recovery", entityId: id, actor, action: "COMPLETED" });
}

export function markNotRequired(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE guest_recoveries SET replacement_status = 'NOT_REQUIRED' WHERE id = ?`).run(id);
  writeAudit({ entityType: "guest_recovery", entityId: id, actor, action: "EDITED", newValue: { replacement_status: "NOT_REQUIRED" } });
}

export function addFollowUpTask(id: string, storeId: string, title: string, actor: SessionUser) {
  const db = getDb();
  const taskId = createTask({ storeId, title, category: "GUEST_RECOVERY_FOLLOWUP", actor, scheduledFor: "TODAY" });
  db.prepare(`UPDATE guest_recoveries SET follow_up_task_id = ? WHERE id = ?`).run(taskId, id);
  writeAudit({ entityType: "guest_recovery", entityId: id, actor, action: "EDITED", newValue: { follow_up_task_id: taskId } });
  return taskId;
}

export interface MealReplacementRow {
  id: string;
  contact_channel: string;
  order_channel: string;
  issue_category: string;
  description: string | null;
  item_description: string | null;
  guest_name: string | null;
  replacement_status: string;
  created_by_name: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * The open queue: reported but not yet fulfilled -- one manager logs it when
 * the guest calls or can't come in right away, any manager (the same one or
 * someone else, whenever the guest actually shows up) pulls it up here and
 * completes it.
 */
export function getOpenMealReplacements(storeId: string): MealReplacementRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT gr.id, gr.contact_channel, gr.order_channel, gr.issue_category, gr.description, gr.item_description,
              gr.guest_name, gr.replacement_status, gr.created_at, gr.completed_at, u.name as created_by_name
       FROM guest_recoveries gr LEFT JOIN users u ON u.id = gr.created_by
       WHERE gr.store_id = ? AND gr.replacement_status IN ('PENDING','APPROVED')
       ORDER BY gr.created_at ASC`
    )
    .all(storeId) as MealReplacementRow[];
}

/** Every meal replacement ever fulfilled, most recent first -- the full
 * record behind "Fulfilled Today," which only ever showed the current day
 * and made it impossible to see what happened last week or last month. */
export function getMealReplacementHistory(storeId: string): MealReplacementRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT gr.id, gr.contact_channel, gr.order_channel, gr.issue_category, gr.description, gr.item_description,
              gr.guest_name, gr.replacement_status, gr.created_at, gr.completed_at, u.name as created_by_name
       FROM guest_recoveries gr LEFT JOIN users u ON u.id = gr.created_by
       WHERE gr.store_id = ? AND gr.replacement_status = 'COMPLETED' AND gr.completed_at IS NOT NULL
       ORDER BY gr.completed_at DESC`
    )
    .all(storeId) as MealReplacementRow[];
}
