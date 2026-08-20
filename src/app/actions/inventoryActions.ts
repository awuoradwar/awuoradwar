"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import * as inventoryService from "@/lib/services/inventoryService";
import * as maintenanceService from "@/lib/services/maintenanceService";
import { InventoryCategory } from "@/lib/services/inventoryService";

function refresh() {
  revalidatePath("/more/inventory");
}

export async function addInventoryItemAction(name: string, category: InventoryCategory, notes: string, parLevel: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  if (!name.trim()) return { error: "Name is required." };
  const par = parLevel.trim() ? Number(parLevel) : null;
  inventoryService.createInventoryItem(user.storeId, name.trim(), category, notes.trim() || null, par, user);
  refresh();
  return { ok: true };
}

export async function updateInventoryItemGroupAction(
  oldName: string,
  oldCategory: InventoryCategory,
  fields: { name: string; category: InventoryCategory; notes: string; parLevel: string }
) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  if (!fields.name.trim()) return { error: "Name is required." };
  const par = fields.parLevel.trim() ? Number(fields.parLevel) : null;
  inventoryService.updateInventoryItemGroup(
    user.storeId,
    oldName,
    oldCategory,
    { name: fields.name.trim(), category: fields.category, notes: fields.notes.trim() || null, parLevel: par },
    user
  );
  refresh();
  return { ok: true };
}

export async function removeInventoryItemAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  inventoryService.removeInventoryItem(id, user);
  refresh();
}

export async function adjustInventoryStockAction(id: string, delta: number) {
  const user = await requireCurrentUser();
  const count = inventoryService.adjustInventoryStock(id, delta, user);
  refresh();
  return { count };
}

export async function setInventoryStockAction(id: string, count: number) {
  const user = await requireCurrentUser();
  inventoryService.setInventoryStock(id, count, user);
  refresh();
}

export async function markInventoryOrderedAction(id: string, qty: string) {
  const user = await requireCurrentUser();
  inventoryService.markInventoryOrdered(id, qty || null, user);
  refresh();
}

export async function markInventoryReceivedAction(id: string) {
  const user = await requireCurrentUser();
  inventoryService.markInventoryReceived(id, user);
  refresh();
}

export async function addMaintenanceItemAction(name: string, location: string, intervalDays: number, notes: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  if (!name.trim()) return { error: "Name is required." };
  if (!intervalDays || intervalDays < 1) return { error: "Interval must be at least 1 day." };
  maintenanceService.createMaintenanceItem(user.storeId, name.trim(), location.trim() || null, intervalDays, notes.trim() || null, user);
  refresh();
  return { ok: true };
}

export async function removeMaintenanceItemAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  maintenanceService.removeMaintenanceItem(id, user);
  refresh();
}

export async function markMaintenanceDoneAction(id: string) {
  const user = await requireCurrentUser();
  maintenanceService.markMaintenanceDone(id, user);
  refresh();
}
