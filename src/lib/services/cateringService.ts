import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";
import { storeLocalIso } from "../storeTime";

export type CateringChannel = "OLO" | "EZCATERING" | "IN_STORE" | "PHONE";

export interface CateringOrder {
  id: string;
  store_id: string;
  due_date: string;
  pickup_time: string | null;
  due_at: string | null;
  customer_name: string | null;
  number_of_people: number | null;
  channel: CateringChannel;
  notes: string | null;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  owner_id: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  completed_by_name?: string | null;
}

const SELECT_WITH_JOIN = `SELECT co.*, u.name as completed_by_name FROM catering_orders co LEFT JOIN users u ON u.id = co.completed_by`;

interface CreateCateringParams {
  storeId: string;
  dueDate: string;
  pickupTime?: string | null;
  customerName?: string | null;
  numberOfPeople: number | null;
  channel: CateringChannel;
  notes?: string | null;
  actor: SessionUser;
  idempotencyKey?: string;
}

export function createCateringOrder(params: CreateCateringParams) {
  return withIdempotency("catering_order", params.idempotencyKey, () => insertCateringOrder(params));
}

function insertCateringOrder(params: CreateCateringParams) {
  const db = getDb();
  const id = newId();
  const dueAt = params.pickupTime ? storeLocalIso(params.storeId, params.dueDate, params.pickupTime) : null;
  db.prepare(
    `INSERT INTO catering_orders (id, store_id, due_date, pickup_time, due_at, customer_name, number_of_people, channel, notes, status, owner_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.dueDate,
    params.pickupTime || null,
    dueAt,
    params.customerName || null,
    params.numberOfPeople,
    params.channel,
    params.notes || null,
    params.actor.id,
    params.actor.id,
    nowIso()
  );
  writeAudit({
    entityType: "catering_order",
    entityId: id,
    actor: params.actor,
    action: "CREATED",
    newValue: { due_date: params.dueDate, number_of_people: params.numberOfPeople, channel: params.channel },
  });
  return id;
}

export function updateCateringOrder(
  id: string,
  storeId: string,
  params: {
    dueDate: string;
    pickupTime: string | null;
    customerName: string | null;
    numberOfPeople: number | null;
    channel: CateringChannel;
    notes: string | null;
  },
  actor: SessionUser
) {
  const db = getDb();
  const dueAt = params.pickupTime ? storeLocalIso(storeId, params.dueDate, params.pickupTime) : null;
  db.prepare(
    `UPDATE catering_orders SET due_date = ?, pickup_time = ?, due_at = ?, customer_name = ?, number_of_people = ?, channel = ?, notes = ? WHERE id = ?`
  ).run(params.dueDate, params.pickupTime, dueAt, params.customerName, params.numberOfPeople, params.channel, params.notes, id);
  writeAudit({ entityType: "catering_order", entityId: id, actor, action: "EDITED", newValue: params });
}

export function completeCateringOrder(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE catering_orders SET status = 'COMPLETED', completed_by = ?, completed_at = ? WHERE id = ? AND status = 'OPEN'`).run(
    actor.id,
    nowIso(),
    id
  );
  writeAudit({ entityType: "catering_order", entityId: id, actor, action: "COMPLETED" });
}

export function cancelCateringOrder(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE catering_orders SET status = 'CANCELLED', completed_by = ?, completed_at = ? WHERE id = ? AND status = 'OPEN'`).run(
    actor.id,
    nowIso(),
    id
  );
  writeAudit({ entityType: "catering_order", entityId: id, actor, action: "CANCELLED" });
}

export function reopenCateringOrder(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE catering_orders SET status = 'OPEN', completed_by = NULL, completed_at = NULL WHERE id = ?`).run(id);
  writeAudit({ entityType: "catering_order", entityId: id, actor, action: "REOPENED" });
}

export function getCateringOrder(id: string, storeId: string): CateringOrder | undefined {
  const db = getDb();
  return db.prepare(`${SELECT_WITH_JOIN} WHERE co.id = ? AND co.store_id = ?`).get(id, storeId) as CateringOrder | undefined;
}

/** Everything due today, any status -- shown pinned at the top of My Shift
 * so it can't get missed the day it's actually due, same reasoning as
 * Cleaning Today staying visible (with its completed items) instead of
 * disappearing once done. */
export function getCateringDueOn(storeId: string, dueDate: string): CateringOrder[] {
  const db = getDb();
  return db
    .prepare(`${SELECT_WITH_JOIN} WHERE co.store_id = ? AND co.due_date = ? ORDER BY (co.pickup_time IS NULL), co.pickup_time`)
    .all(storeId, dueDate) as CateringOrder[];
}

export function getUpcomingCateringOrders(storeId: string, fromDate: string, limit = 50): CateringOrder[] {
  const db = getDb();
  return db
    .prepare(`${SELECT_WITH_JOIN} WHERE co.store_id = ? AND co.due_date > ? AND co.status = 'OPEN' ORDER BY co.due_date, (co.pickup_time IS NULL), co.pickup_time LIMIT ?`)
    .all(storeId, fromDate, limit) as CateringOrder[];
}

export function getPastOpenCateringOrders(storeId: string, beforeDate: string, limit = 50): CateringOrder[] {
  const db = getDb();
  return db
    .prepare(`${SELECT_WITH_JOIN} WHERE co.store_id = ? AND co.due_date < ? AND co.status = 'OPEN' ORDER BY co.due_date DESC LIMIT ?`)
    .all(storeId, beforeDate, limit) as CateringOrder[];
}

export function getCateringHistory(storeId: string, limit = 30): CateringOrder[] {
  const db = getDb();
  return db
    .prepare(`${SELECT_WITH_JOIN} WHERE co.store_id = ? AND co.status != 'OPEN' ORDER BY co.completed_at DESC LIMIT ?`)
    .all(storeId, limit) as CateringOrder[];
}
