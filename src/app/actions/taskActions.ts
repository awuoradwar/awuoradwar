"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser, getCurrentPicForStore } from "@/lib/auth";
import * as taskService from "@/lib/services/taskService";
import * as pushService from "@/lib/services/pushService";
import { translateFields, resolveBilingualPair } from "@/lib/services/translationService";
import { canDo } from "@/lib/permissions";
import { storeToday, storeLocalIso } from "@/lib/storeTime";

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

export async function setTaskSupportAction(taskId: string, supportId: string | null) {
  const user = await requireCurrentUser();
  taskService.setTaskSupport(taskId, supportId, user);
  refresh();
}

export async function carryForwardTaskAction(taskId: string) {
  const user = await requireCurrentUser();
  const tomorrow = new Date(new Date(storeToday(user.storeId) + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  taskService.carryForwardTask(taskId, tomorrow, user);
  refresh();
}

export async function cancelTaskAction(taskId: string, reason: string) {
  const user = await requireCurrentUser();
  taskService.cancelTask(taskId, reason || "No reason given", user);
  refresh();
}

export async function cancelTaskSeriesAction(templateId: string, reason: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
  taskService.cancelTaskSeries(templateId, reason || "No reason given", user);
  refresh();
  revalidatePath("/more/templates");
}

export async function updateTaskAction(taskId: string, formData: FormData) {
  const user = await requireCurrentUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const titleEsTyped = String(formData.get("titleEs") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const descriptionEsTyped = String(formData.get("descriptionEs") || "").trim() || null;
  const dueDate = String(formData.get("dueDate") || "");
  const dueTime = String(formData.get("dueTime") || "");

  // Auto-translate whichever side wasn't typed in manually -- a manager
  // writing in English gets a Spanish version filled in for a Spanish
  // speaker to read, and vice versa, without either of them re-typing
  // anything. A manually-filled companion field is left untouched.
  const toTranslate: Record<string, string> = {};
  if (!titleEsTyped) toTranslate.title = title;
  if (description && !descriptionEsTyped) toTranslate.description = description;
  const translated = Object.keys(toTranslate).length > 0 ? await translateFields(toTranslate) : {};

  const titlePair = resolveBilingualPair(translated?.title, title, titleEsTyped);
  const descriptionPair = description ? resolveBilingualPair(translated?.description, description, descriptionEsTyped) : { primary: null, secondary: null };

  taskService.updateTask(
    taskId,
    {
      title: titlePair.primary,
      titleEs: titlePair.secondary,
      description: descriptionPair.primary,
      descriptionEs: descriptionPair.secondary,
      dueAt: dueDate ? storeLocalIso(user.storeId, dueDate, dueTime || "00:00") : null,
      scheduledDate: dueDate || null,
      effort: String(formData.get("effort") || "STANDARD"),
      severity: String(formData.get("severity") || "NORMAL"),
    },
    user
  );
  refresh();
  revalidatePath(`/task/${taskId}`);
  return { ok: true };
}

export async function addTaskNoteAction(taskId: string, formData: FormData) {
  const user = await requireCurrentUser();
  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note can't be empty." };
  taskService.addTaskNote(taskId, note, user);
  revalidatePath(`/task/${taskId}`);
  revalidatePath("/more/weekly-summary");
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
    scheduledDate: String(formData.get("scheduledDate") || storeToday(user.storeId)),
    effort: String(formData.get("effort") || "STANDARD"),
    severity,
    actor: user,
  });
  refresh();
  if (severity === "CRITICAL") {
    const payload = { title: "🔴 Critical task", body: title, url: "/my-shift" };
    const send = ownerId ? pushService.sendPushToUser(ownerId, payload) : pushService.sendPushToStore(user.storeId, payload);
    send.catch(() => {});
  }
  return { ok: true };
}
