import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export type InventoryCategory = "SUPPLIES" | "UNIFORMS" | "EQUIPMENT" | "TOOLS" | "OTHER";
export type InventoryStatus = "OK" | "LOW" | "ORDERED";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  notes: string | null;
  status: InventoryStatus;
  last_ordered_at: string | null;
  last_ordered_qty: string | null;
}

export function getInventoryItems(storeId: string): InventoryItem[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, category, notes, status, last_ordered_at, last_ordered_qty FROM inventory_items
       WHERE store_id = ? AND active = 1 ORDER BY
       CASE status WHEN 'LOW' THEN 0 WHEN 'ORDERED' THEN 1 ELSE 2 END, name`
    )
    .all(storeId) as InventoryItem[];
}

export function createInventoryItem(storeId: string, name: string, category: InventoryCategory, notes: string | null, actor: SessionUser): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO inventory_items (id, store_id, name, category, notes, status, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'OK', 1, ?, ?)`
  ).run(id, storeId, name, category, notes || null, actor.id, nowIso());
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "CREATED", newValue: { name, category } });
  return id;
}

export function removeInventoryItem(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "CANCELLED" });
}

export function markInventoryLow(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET status = 'LOW' WHERE id = ?`).run(id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { status: "LOW" } });
}

export function markInventoryOrdered(id: string, qty: string | null, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE inventory_items SET status = 'ORDERED', last_ordered_at = ?, last_ordered_qty = ? WHERE id = ?`).run(ts, qty || null, id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { status: "ORDERED", qty } });
}

export function markInventoryReceived(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET status = 'OK' WHERE id = ?`).run(id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "COMPLETED", newValue: { status: "OK" } });
}
