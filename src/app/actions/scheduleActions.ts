"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import * as scheduleService from "@/lib/services/scheduleService";
import { ShiftType } from "@/lib/services/scheduleService";

function refresh() {
  revalidatePath("/week");
  revalidatePath("/my-shift");
}

export async function setManagerShiftAction(userId: string, date: string, shiftType: ShiftType) {
  const user = await requireCurrentUser();
  if (!canDo(user, "manager_shifts.manage")) throw new Error("FORBIDDEN");
  const id = scheduleService.setManagerShift(user.storeId, userId, date, shiftType, user);
  refresh();
  return { ok: true, id };
}

export async function removeManagerShiftAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "manager_shifts.manage")) throw new Error("FORBIDDEN");
  scheduleService.removeManagerShift(id, user);
  refresh();
}

export async function addManagerActivityAction(userId: string, date: string, label: string, startTime: string, endTime: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "manager_shifts.manage")) throw new Error("FORBIDDEN");
  if (!label.trim()) return { error: "Label is required." };
  const id = scheduleService.addManagerActivity(user.storeId, userId, date, label.trim(), startTime || null, endTime || null, user);
  refresh();
  return { ok: true, id };
}

export async function removeManagerActivityAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "manager_shifts.manage")) throw new Error("FORBIDDEN");
  scheduleService.removeManagerActivity(id, user);
  refresh();
}
