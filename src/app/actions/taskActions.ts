"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser, getCurrentPicForStore } from "@/lib/auth";
import * as taskService from "@/lib/services/taskService";
import * as pushService from "@/lib/services/pushService";

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

export async function updateTaskAction(taskId: string, formData: FormData) {
  const user = await requireCurrentUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const dueDate = String(formData.get("dueDate") || "");
  const dueTime = String(formData.get("dueTime") || "");
  taskService.updateTask(
    taskId,
    {
      title,
      description: String(formData.get("description") || "") || null,
      dueAt: dueDate ? `${dueDate}T${dueTime || "00:00"}:00` : null,
      effort: String(formData.get("effort") || "STANDARD"),
      severity: String(formData.get("severity") || "NORMAL"),
    },
    user
  );
  refresh();
  revalidatePath(`/task/${taskId}`);
  return { ok: true };
}

export async function createTaskAction(formData: FormData) {
  const user = await requireCurrentUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const severity = String(formData.get("severity") || "NORMAL");
  const ownerId = String(formData.get("ownerId") || "") || null;
  taskService.createTask({
    storeId: user.storeId,
    title,
    description: String(formData.get("description") || "") || undefined,
    area: String(formData.get("area") || "") || undefined,
    ownerId,
    dueAt: String(formData.get("dueAt") || "") || null,
    scheduledFor: String(formData.get("scheduledFor") || "TODAY"),
    scheduledDate: String(formData.get("scheduledDate") || new Date().toISOString().slice(0, 10)),
    effort: String(formData.get("effort") || "STANDARD"),
    severity,
    actor: user,
  });
  refresh();
  if (severity === "CRITICAL") {
    const payload = { title: "🔴 Critical task", body: title, url: "/my-shift" };
    const send = ownerId ? pushService.sendPushToUser(ownerId, payload) : pushService.sendPushToStore(user.storeId, payload, user.id);
    send.catch(() => {});
  }
  return { ok: true };
}
