"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser, getCurrentPicForStore } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId, nowIso, writeAudit } from "@/lib/audit";
import * as attendanceService from "@/lib/services/attendanceService";
import * as guestRecoveryService from "@/lib/services/guestRecoveryService";
import * as borrowingService from "@/lib/services/borrowingService";
import * as issueService from "@/lib/services/issueService";
import * as acknowledgementService from "@/lib/services/acknowledgementService";
import * as taskService from "@/lib/services/taskService";

function refresh() {
  revalidatePath("/my-shift");
  revalidatePath("/handoff");
  revalidatePath("/more/cleaning");
  revalidatePath("/more/acknowledgements");
  revalidatePath("/more/search");
  revalidatePath("/more/work-orders");
}

function fd(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

export async function quickAddTaskAction(formData: FormData) {
  const user = await requireCurrentUser();
  const title = fd(formData, "title");
  if (!title) return { error: "Title is required." };
  taskService.createTask({
    storeId: user.storeId,
    title,
    scheduledFor: fd(formData, "scheduledFor") || "TODAY",
    effort: fd(formData, "effort") || "QUICK",
    actor: user,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

export async function quickAddCallInAction(formData: FormData) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  const employeeName = fd(formData, "employeeName");
  if (!employeeName) return { error: "Employee name is required." };
  attendanceService.recordAttendanceEvent({
    storeId: user.storeId,
    shiftId: shift?.id,
    employeeName,
    type: "CALL_IN",
    scheduledTime: fd(formData, "scheduledTime") || null,
    coverageStatus: fd(formData, "coverageStatus") || "NEEDED",
    coveringPerson: fd(formData, "coveringPerson") || null,
    note: fd(formData, "note") || null,
    actor: user,
    picId: shift?.pic_user_id ?? null,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

export async function quickAddLateAction(formData: FormData) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  const employeeName = fd(formData, "employeeName");
  if (!employeeName) return { error: "Employee name is required." };
  attendanceService.recordAttendanceEvent({
    storeId: user.storeId,
    shiftId: shift?.id,
    employeeName,
    type: "LATE",
    scheduledTime: fd(formData, "scheduledTime") || null,
    actualTime: fd(formData, "actualTime") || new Date().toISOString(),
    note: fd(formData, "note") || null,
    actor: user,
    picId: shift?.pic_user_id ?? null,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

export async function quickAddAttendanceOtherAction(formData: FormData) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  const employeeName = fd(formData, "employeeName");
  const type = fd(formData, "type") as "NO_SHOW" | "LEFT_EARLY" | "SENT_HOME";
  if (!employeeName) return { error: "Employee name is required." };
  attendanceService.recordAttendanceEvent({
    storeId: user.storeId,
    shiftId: shift?.id,
    employeeName,
    type,
    note: fd(formData, "note") || null,
    actor: user,
    picId: shift?.pic_user_id ?? null,
  });
  refresh();
  return { ok: true };
}

export async function quickAddCleaningAction(formData: FormData) {
  const user = await requireCurrentUser();
  const db = getDb();
  const areaId = fd(formData, "areaId");
  const title = fd(formData, "title");
  if (!areaId || !title) return { error: "Area and title are required." };
  const id = newId();
  const frequency = fd(formData, "frequency") === "WEEKLY" ? "WEEKLY" : "DAILY";
  db.prepare(
    `INSERT INTO cleaning_tasks (id, area_id, title, frequency, associate_name, manager_owner_id, status, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(id, areaId, title, frequency, fd(formData, "associateName") || null, user.id, fd(formData, "photoRequired") === "on" ? 1 : 0, nowIso());
  writeAudit({ entityType: "cleaning_task", entityId: id, actor: user, action: "CREATED" });
  refresh();
  return { ok: true };
}

/** Single entry point for guest recovery / meal replacement -- these were
 * always the same underlying record (issueCategory just defaults to
 * FOOD_QUALITY for the common "meal replacement" case); one form now covers
 * both instead of two near-identical quick-add buttons. */
export async function quickAddMealReplacementAction(formData: FormData) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  const valueStr = fd(formData, "valueEstimate");
  guestRecoveryService.createGuestRecovery({
    storeId: user.storeId,
    contactChannel: fd(formData, "contactChannel") as "PHONE" | "IN_STORE",
    orderChannel: fd(formData, "orderChannel") as "ONLINE" | "IN_STORE" | "DRIVE_THRU",
    issueCategory: fd(formData, "issueCategory") || "FOOD_QUALITY",
    description: fd(formData, "description") || undefined,
    itemDescription: fd(formData, "itemDescription") || undefined,
    valueEstimate: valueStr ? Number(valueStr) : null,
    actor: user,
    picId: shift?.pic_user_id ?? null,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

export async function quickAddBorrowedItemAction(formData: FormData) {
  const user = await requireCurrentUser();
  const borrowedFrom = fd(formData, "borrowedFrom");
  const item = fd(formData, "item");
  if (!borrowedFrom || !item) return { error: "Store and item are required." };
  borrowingService.createBorrowedItem({
    storeId: user.storeId,
    borrowedFrom,
    item,
    quantity: fd(formData, "quantity") ? Number(fd(formData, "quantity")) : undefined,
    unit: fd(formData, "unit") || undefined,
    actor: user,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

function dueDateForWhen(when: string): string | null {
  const now = new Date();
  if (when === "TODAY") return now.toISOString().slice(0, 10);
  if (when === "THIS_WEEK") {
    const end = new Date(now.getTime() + 6 * 86400000);
    return end.toISOString().slice(0, 10);
  }
  return null;
}

export async function quickAddIssueAction(formData: FormData) {
  const user = await requireCurrentUser();
  const description = fd(formData, "description");
  if (!description) return { error: "Description is required." };
  issueService.createIssue({
    storeId: user.storeId,
    category: fd(formData, "category") || "EQUIPMENT",
    description,
    severity: (fd(formData, "severity") as "NORMAL" | "CRITICAL") || "NORMAL",
    dueDate: dueDateForWhen(fd(formData, "when")),
    actor: user,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

export async function quickAddAcknowledgementAction(formData: FormData) {
  const user = await requireCurrentUser();
  const title = fd(formData, "title");
  const associatesRaw = fd(formData, "associates");
  if (!title || !associatesRaw) return { error: "Title and at least one associate are required." };
  const associates = associatesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  acknowledgementService.createAcknowledgement({
    storeId: user.storeId,
    title,
    requiredAssociates: associates,
    actor: user,
  });
  refresh();
  return { ok: true };
}

export async function quickAddNoteAction(formData: FormData) {
  const user = await requireCurrentUser();
  const shift = getCurrentPicForStore(user.storeId);
  const text = fd(formData, "text");
  if (!text) return { error: "Note text is required." };
  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO shift_notes (id, store_id, shift_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    user.storeId,
    shift?.id || null,
    user.id,
    text,
    nowIso()
  );
  writeAudit({ entityType: "shift_note", entityId: id, actor: user, action: "CREATED" });
  refresh();
  return { ok: true };
}
