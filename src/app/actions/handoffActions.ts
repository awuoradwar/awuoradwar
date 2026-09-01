"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { getOrCreateTodayShift } from "@/lib/services/shiftService";
import * as handoffService from "@/lib/services/handoffService";
import * as pushService from "@/lib/services/pushService";

function refresh() {
  revalidatePath("/handoff");
  revalidatePath("/my-shift");
}

export async function generateHandoffAction() {
  const user = await requireCurrentUser();
  const shift = getOrCreateTodayShift(user.storeId, user);
  const id = handoffService.generateHandoff(user.storeId, shift.id, shift.pic_user_id || user.id, user);
  refresh();
  pushService
    .sendPushToStore(user.storeId, { title: "Handoff ready", body: "A new shift handoff is ready to review.", url: "/handoff" })
    .catch(() => {});
  return id;
}

export async function completeOutgoingHandoffAction(handoffId: string, note: string) {
  const user = await requireCurrentUser();
  handoffService.completeOutgoingHandoff(handoffId, note || null, user);
  refresh();
}

export async function acknowledgeHandoffAction(handoffId: string) {
  const user = await requireCurrentUser();
  handoffService.acknowledgeHandoff(handoffId, user.id, user);
  refresh();
}
