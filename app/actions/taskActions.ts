"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser, getCurrentPicForStore } from "@/lib/auth";
import * as taskService from "@/lib/services/taskService";

function refresh() {
  revalidatePath("/my-shift");
  revalidatePath("/week");
  revalidatePath("/handoff");
}

export async function completeTaskAction(taskId: string) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  taskService.completeTask(taskId, user, shift?.pic_user_id ?? null);
  refresh();
}

export async function verifyTaskAction(taskId: string) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  taskService.verifyTask(taskId, user, shift?.pic_user_id ?? null);
  refresh();
}

export async function reassignTaskAction(taskId: string, newOwnerId: string) {
  const user = await requireCurrentUser();
  taskService.reassignTask(taskId, newOwnerId, user);
  refresh();
}

export async function carryForwardTaskAction(taskId: string, newDate: string) {
  const user = await requireCurrentUser();
  taskService.carryForwardTask(taskId, newDate, user);
  refresh();
}

export async function cancelTaskAction(taskId: string, reason: string) {
  const user = await requireCurrentUser();
  taskService.cancelTask(taskId, reason || "No reason given", user);
  refresh();
}

export async function createTaskAction(formData: FormData) {
  const user = await requireCurrentUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  taskService.createTask({
    storeId: user.storeId,
    title,
    description: String(formData.get("description") || "") || undefined,
    area: String(formData.get("area") || "") || undefined,
    ownerId: String(formData.get("ownerId") || "") || null,
    dueAt: String(formData.get("dueAt") || "") || null,
    scheduledFor: String(formData.get("scheduledFor") || "TODAY"),
    scheduledDate: String(formData.get("scheduledDate") || new Date().toISOString().slice(0, 10)),
    effort: String(formData.get("effort") || "STANDARD"),
    severity: String(formData.get("severity") || "NORMAL"),
    actor: user,
  });
  refresh();
  return { ok: true };
}
