import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";
import { DEFAULT_INVENTORY_ITEMS } from "../defaultInventoryItems";

export type InventoryCategory = "SUPPLIES" | "UNIFORMS" | "EQUIPMENT" | "TOOLS" | "OTHER";

export interface InventoryItem {
  id: string;
  name: string;
  variant: string | null;
  sort_order: number;
  category: InventoryCategory;
  notes: string | null;
  stock_count: number;
  par_level: number | null;
  on_order: number; // 0 | 1
  last_ordered_at: string | null;
  last_ordered_qty: string | null;
}

export function getInventoryItems(storeId: string): InventoryItem[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, variant, sort_order, category, notes, stock_count, par_level, on_order, last_ordered_at, last_ordered_qty
       FROM inventory_items WHERE store_id = ? AND active = 1 ORDER BY category, name, sort_order, variant`
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
    `INSERT INTO inventory_items (id, store_id, name, variant, sort_order, category, stock_count, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
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
  parLevel: number | null,
  actor: SessionUser,
  variant: string | null = null,
  sortOrder = 0
): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO inventory_items (id, store_id, name, variant, sort_order, category, notes, stock_count, par_level, on_order, active, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 1, ?, ?)`
  ).run(id, storeId, name, variant, sortOrder, category, notes || null, parLevel, actor.id, nowIso());
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "CREATED", newValue: { name, category, variant } });
  return id;
}

export function removeInventoryItem(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "CANCELLED" });
}

/** Relative +1/-1 taps for the common case -- clamped at 0, no typing needed. */
export function adjustInventoryStock(id: string, delta: number, actor: SessionUser): number {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET stock_count = MAX(0, stock_count + ?) WHERE id = ?`).run(delta, id);
  const row = db.prepare(`SELECT stock_count FROM inventory_items WHERE id = ?`).get(id) as { stock_count: number };
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { stock_count: row.stock_count } });
  return row.stock_count;
}

/** Direct entry for a bulk recount (e.g. after a delivery) rather than tapping +1 dozens of times. */
export function setInventoryStock(id: string, count: number, actor: SessionUser) {
  const db = getDb();
  const clamped = Math.max(0, Math.round(count));
  db.prepare(`UPDATE inventory_items SET stock_count = ? WHERE id = ?`).run(clamped, id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { stock_count: clamped } });
}

export function markInventoryOrdered(id: string, qty: string | null, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET on_order = 1, last_ordered_at = ?, last_ordered_qty = ? WHERE id = ?`).run(nowIso(), qty || null, id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "EDITED", newValue: { on_order: true, qty } });
}

/** If the order quantity was logged as a plain number, it's folded straight
 * into the stock count -- the common case needs no further action. A
 * non-numeric quantity (e.g. "2 boxes") just clears the order flag and
 * leaves the count for a manual recount via the stepper. */
export function markInventoryReceived(id: string, actor: SessionUser) {
  const db = getDb();
  const row = db.prepare(`SELECT stock_count, last_ordered_qty FROM inventory_items WHERE id = ?`).get(id) as
    | { stock_count: number; last_ordered_qty: string | null }
    | undefined;
  const parsedQty = row?.last_ordered_qty ? Number(row.last_ordered_qty) : NaN;
  const newCount = row && Number.isFinite(parsedQty) ? row.stock_count + parsedQty : row?.stock_count ?? 0;
  db.prepare(`UPDATE inventory_items SET on_order = 0, last_ordered_qty = NULL, stock_count = ? WHERE id = ?`).run(newCount, id);
  writeAudit({ entityType: "inventory_item", entityId: id, actor, action: "COMPLETED", newValue: { on_order: false, stock_count: newCount } });
}
