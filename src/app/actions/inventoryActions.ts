"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import * as inventoryService from "@/lib/services/inventoryService";
import * as maintenanceService from "@/lib/services/maintenanceService";
import { InventoryCategory, InventoryStatus } from "@/lib/services/inventoryService";

function refresh() {
  revalidatePath("/more/inventory");
}

export async function addInventoryItemAction(name: string, category: InventoryCategory, notes: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  if (!name.trim()) return { error: "Name is required." };
  inventoryService.createInventoryItem(user.storeId, name.trim(), category, notes.trim() || null, user);
  refresh();
  return { ok: true };
}

export async function removeInventoryItemAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "inventory.manage")) throw new Error("FORBIDDEN");
  inventoryService.removeInventoryItem(id, user);
  refresh();
}

export async function cycleInventoryStatusAction(id: string, currentStatus: InventoryStatus) {
  const user = await requireCurrentUser();
  const next = inventoryService.cycleInventoryStatus(id, currentStatus, user);
  refresh();
  return { status: next };
}

export async function setInventoryOrderQtyAction(id: string, qty: string) {
  const user = await requireCurrentUser();
  inventoryService.setInventoryOrderQty(id, qty, user);
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
