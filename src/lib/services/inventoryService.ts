import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";
import { DEFAULT_INVENTORY_ITEMS } from "../defaultInventoryItems";

export type InventoryCategory = "SUPPLIES" | "UNIFORMS" | "EQUIPMENT" | "TOOLS" | "OTHER";
export type InventoryStatus = "OK" | "LOW" | "ORDERED";

const STATUS_CYCLE: InventoryStatus[] = ["OK", "LOW", "ORDERED"];

export interface InventoryItem {
  id: string;
  name: string;
  variant: string | null;
  sort_order: number;
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
      `SELECT id, name, variant, sort_order, category, notes, status, last_ordered_at, last_ordered_qty FROM inventory_items
       WHERE store_id = ? AND active = 1 ORDER BY category, name, sort_order, variant`
    )
    .all(storeId) as InventoryItem[];
}

/** First time a store's inventory list is empty, bootstrap it with the
 * real starter list (uniforms with actual sizes, common restaurant
 * smallwares/supplies) so a GM doesn't have to type in dozens of items by
 * hand before the feature is useful. Never touches a store that already has
 * items -- purely a one-time, one-way fill of empty state. */
export function ensureDefaultInventoryItems(storeId: string, actor: SessionUser) {
  const db = getDb();
  const count = db.prepare(`SELECT COUNT(*) as n FROM inventory_items WHERE store_id = ?`).get(storeId) as { n: number };
  if (count.n > 0) return;
  const insert = db.prepare(
    `INSERT INTO inventory_items (id, store_id, name, variant, sort_order, category, status, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'OK', 1, ?, ?)`
  );
  const ts = nowIso();
  const insertMany = db.transaction((items: typeof DEFAULT_INVENTORY_ITEMS) => {
    for (const it of items) {
      insert.run(newId(), storeId, it.name, it.variant, it.sortOrder ?? 0, it.category, actor.id, ts);
    }
  });
  insertMany(DEFAULT_INVENTORY_ITEMS);
}

export function createInventoryItem(
  storeId: string,
  name: string,
  category: InventoryCategory,
  notes: string | null,
  actor: SessionUser,
  variant: string | null = null,
  sortOrder = 0
): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO inventory_items (id, store_id, name, variant, sort_order, category, notes, status, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'OK', 1, ?, ?)`
  ).run(id, storeId, name, variant, sortOrder, category, notes || null, actor.id, nowIso());
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "CREATED", newValue: { name, category, variant } });
  return id;
}

export function removeInventoryItem(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "CANCELLED" });
}

/** One tap moves through OK -> Low -> Ordered -> OK. Ordered stamps today's
 * date automatically; a quantity can be attached separately (see
 * setInventoryOrderQty) without blocking the fast single-tap path. */
export function cycleInventoryStatus(id: string, currentStatus: InventoryStatus, actor: SessionUser): InventoryStatus {
  const db = getDb();
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length];
  if (next === "ORDERED") {
    db.prepare(`UPDATE inventory_items SET status = ?, last_ordered_at = ? WHERE id = ?`).run(next, nowIso(), id);
  } else {
    db.prepare(`UPDATE inventory_items SET status = ? WHERE id = ?`).run(next, id);
  }
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { status: next } });
  return next;
}

export function setInventoryOrderQty(id: string, qty: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET last_ordered_qty = ? WHERE id = ?`).run(qty || null, id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { last_ordered_qty: qty } });
}
