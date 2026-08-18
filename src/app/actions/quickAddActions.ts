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
import * as pushService from "@/lib/services/pushService";
import { weekStartOf } from "@/lib/services/recurrenceService";
import { canDo } from "@/lib/permissions";
import { storeToday, storeLocalIso } from "@/lib/storeTime";

function refresh() {
  revalidatePath("/my-shift");
  revalidatePath("/handoff");
  revalidatePath("/more/cleaning");
  revalidatePath("/more/acknowledgements");
  revalidatePath("/more/search");
  revalidatePath("/more/work-orders");
  revalidatePath("/week");
  revalidatePath("/more/templates");
}

function fd(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

/** Maps the quick-add "When" bucket to an actual scheduled_date -- without
 * this, every task landed on today's date regardless of what was picked,
 * so a task marked "Tomorrow" would wrongly show up under today on Week. */
function scheduledDateForWhen(when: string, storeId: string): string {
  const todayStr = storeToday(storeId);
  if (when === "TOMORROW") return new Date(new Date(todayStr + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  if (when === "LATER_THIS_WEEK") {
    const weekStart = weekStartOf(todayStr);
    return new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  }
  return todayStr; // TODAY, NEXT_SHIFT
}

export async function quickAddTaskAction(formData: FormData) {
  const user = await requireCurrentUser();
  const title = fd(formData, "title");
  if (!title) return { error: "Title is required." };

  const dueTime = fd(formData, "dueTime");

  if (fd(formData, "recurring") === "on") {
    if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
    const weekdaysRaw = formData.getAll("weekdays").map(String);
    if (weekdaysRaw.length === 0) return { error: "Pick at least one day for a recurring task." };
    if (taskService.activeTemplateTitleExists(user.storeId, title)) {
      return { error: `A recurring task named "${title}" already exists. Edit it from More > Templates instead of adding a duplicate.` };
    }
    const db = getDb();
    const id = newId();
    const config = { weekdays: weekdaysRaw.map(Number), dueTime: dueTime || undefined };
    db.prepare(
      `INSERT INTO task_templates (id, store_id, title, description, area, category, recurrence_type, recurrence_config,
        default_owner_position, effort, verification_required, source, active, created_at)
       VALUES (?, ?, ?, NULL, NULL, 'ROUTINE', 'WEEKLY', ?, NULL, ?, 0, 'manual', 1, ?)`
    ).run(id, user.storeId, title, JSON.stringify(config), fd(formData, "effort") || "STANDARD", nowIso());
    writeAudit({ entityType: "task_template", entityId: id, actor: user, action: "CREATED", newValue: { title } });
    refresh();
    return { ok: true };
  }

  const scheduledFor = fd(formData, "scheduledFor") || "TODAY";
  const scheduledDate = scheduledDateForWhen(scheduledFor, user.storeId);
  taskService.createTask({
    storeId: user.storeId,
    title,
    scheduledFor,
    scheduledDate,
    dueAt: dueTime ? storeLocalIso(user.storeId, scheduledDate, dueTime) : null,
    effort: fd(formData, "effort") || "QUICK",
    ownerId: fd(formData, "ownerId") || null,
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
  const weekdayRaw = fd(formData, "weekday");
  const weekday = frequency === "WEEKLY" && weekdayRaw !== "" ? Number(weekdayRaw) : null;
  db.prepare(
    `INSERT INTO cleaning_tasks (id, area_id, title, description, frequency, weekday, associate_name, manager_owner_id, status, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(
    id,
    areaId,
    title,
    fd(formData, "description") || null,
    frequency,
    weekday,
    fd(formData, "associateName") || null,
    user.id,
    fd(formData, "photoRequired") === "on" ? 1 : 0,
    nowIso()
  );
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
    guestName: fd(formData, "guestName") || undefined,
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
  const direction = fd(formData, "direction") === "LENT" ? "LENT" : "BORROWED";
  const pickedUpAtLocal = fd(formData, "pickedUpAt"); // datetime-local: "YYYY-MM-DDTHH:MM"
  const pickedUpAt = pickedUpAtLocal
    ? storeLocalIso(user.storeId, pickedUpAtLocal.slice(0, 10), pickedUpAtLocal.slice(11, 16))
    : null;
  borrowingService.createBorrowedItem({
    storeId: user.storeId,
    direction,
    borrowedFrom,
    item,
    quantity: fd(formData, "quantity") ? Number(fd(formData, "quantity")) : undefined,
    unit: fd(formData, "unit") || undefined,
    approvedByName: fd(formData, "approvedByName") || undefined,
    pickedUpByName: fd(formData, "pickedUpByName") || undefined,
    pickedUpAt,
    actor: user,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  return { ok: true };
}

function dueDateForWhen(when: string, storeId: string): string | null {
  const todayStr = storeToday(storeId);
  if (when === "TODAY") return todayStr;
  if (when === "THIS_WEEK") {
    return new Date(new Date(todayStr + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

export async function quickAddIssueAction(formData: FormData) {
  const user = await requireCurrentUser();
  const description = fd(formData, "description");
  if (!description) return { error: "Description is required." };
  const severity = (fd(formData, "severity") as "NORMAL" | "CRITICAL") || "NORMAL";
  issueService.createIssue({
    storeId: user.storeId,
    category: fd(formData, "category") || "EQUIPMENT",
    description,
    severity,
    dueDate: dueDateForWhen(fd(formData, "when"), user.storeId),
    actor: user,
    idempotencyKey: fd(formData, "idempotencyKey") || undefined,
  });
  refresh();
  if (severity === "CRITICAL") {
    pushService
      .sendPushToStore(
        user.storeId,
        { title: "🔴 Critical work order", body: description, url: "/more/work-orders" },
        user.id
      )
      .catch(() => {});
  }
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
