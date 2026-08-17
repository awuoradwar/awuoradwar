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
