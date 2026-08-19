import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";

export type BorrowDirection = "BORROWED" | "LENT";

export function createBorrowedItem(params: {
  storeId: string;
  direction: BorrowDirection;
  borrowedFrom: string;
  item: string;
  quantity?: number;
  unit?: string;
  approvedByName?: string | null;
  pickedUpByName?: string | null;
  pickedUpAt?: string | null;
  dueAt?: string | null;
  ownerId?: string | null;
  actor: SessionUser;
  idempotencyKey?: string;
}) {
  return withIdempotency("borrowed_item", params.idempotencyKey, () => insertBorrowedItem(params));
}

function insertBorrowedItem(params: {
  storeId: string;
  direction: BorrowDirection;
  borrowedFrom: string;
  item: string;
  quantity?: number;
  unit?: string;
  approvedByName?: string | null;
  pickedUpByName?: string | null;
  pickedUpAt?: string | null;
  dueAt?: string | null;
  ownerId?: string | null;
  actor: SessionUser;
}) {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO borrowed_items (id, store_id, direction, borrowed_from, item, quantity, unit, approved_by_name, picked_up_by_name, picked_up_at, due_at, owner_id, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`
  ).run(
    id,
    params.storeId,
    params.direction,
    params.borrowedFrom,
    params.item,
    params.quantity ?? null,
    params.unit || null,
    params.approvedByName || null,
    params.pickedUpByName || null,
    params.pickedUpAt || null,
    params.dueAt || null,
    params.ownerId || params.actor.id,
    params.actor.id,
    nowIso()
  );
  writeAudit({ entityType: "borrowed_item", entityId: id, actor: params.actor, action: "CREATED" });
  return id;
}

/** Fix a typo or wrong quantity/unit after the fact -- separate from
 * settlement, which tracks how the borrow gets resolved, not what was
 * borrowed. Editable regardless of status so a mistake caught after
 * settling can still be corrected in the record. */
export function updateBorrowedItem(
  id: string,
  params: {
    direction: BorrowDirection;
    borrowedFrom: string;
    item: string;
    quantity: number | null;
    unit: string | null;
    approvedByName: string | null;
    pickedUpByName: string | null;
    pickedUpAt: string | null;
    dueAt: string | null;
  },
  actor: SessionUser
) {
  const db = getDb();
  db.prepare(
    `UPDATE borrowed_items SET direction = ?, borrowed_from = ?, item = ?, quantity = ?, unit = ?, approved_by_name = ?, picked_up_by_name = ?, picked_up_at = ?, due_at = ? WHERE id = ?`
  ).run(
    params.direction,
    params.borrowedFrom,
    params.item,
    params.quantity,
    params.unit,
    params.approvedByName,
    params.pickedUpByName,
    params.pickedUpAt,
    params.dueAt,
    id
  );
  writeAudit({ entityType: "borrowed_item", entityId: id, actor, action: "EDITED", newValue: params });
}

export function selectSettlement(id: string, method: "RETURN_PRODUCT" | "CRUNCHTIME_TRANSFER" | "PENDING_CONFIRMATION", actor: SessionUser) {
  const db = getDb();
  const status = method === "PENDING_CONFIRMATION" ? "SETTLEMENT_SELECTED" : "SETTLEMENT_SELECTED";
  db.prepare(`UPDATE borrowed_items SET settlement_method = ?, status = ? WHERE id = ?`).run(method, status, id);
  writeAudit({ entityType: "borrowed_item", entityId: id, actor, action: "EDITED", newValue: { settlement_method: method } });
}

export function settleBorrowedItem(id: string, actor: SessionUser, notes?: string) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE borrowed_items SET status = 'SETTLED', completed_by = ?, completed_at = ?, notes = ? WHERE id = ?`).run(actor.id, ts, notes || null, id);
  writeAudit({ entityType: "borrowed_item", entityId: id, actor, action: "SETTLED" });
}

export function getOpenBorrowedItems(storeId: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM borrowed_items WHERE store_id = ? AND status != 'SETTLED' ORDER BY created_at DESC`).all(storeId);
}
