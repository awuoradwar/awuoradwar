"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth";
import * as cleaningService from "@/lib/services/cleaningService";

function refresh() {
  revalidatePath("/more/cleaning");
  revalidatePath("/my-shift");
  revalidatePath("/handoff");
}

// Same private-storage pattern as schedule-request attachments: a real file on
// disk outside public/, only reachable through the authenticated
// /api/cleaning-photos/[taskId] route.
const PHOTO_DIR = path.join(process.cwd(), "data", "private-uploads", "cleaning-photos");

/** Plain completion, no photo -- used for cleaning tasks that don't require one. */
export async function completeCleaningAction(id: string) {
  const user = await requireCurrentUser();
  try {
    cleaningService.completeCleaningTask(id, user, null);
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^PHOTO_REQUIRED: /, "") : "Could not complete task." };
  }
  refresh();
  return { ok: true };
}

async function storePhotoFile(taskId: string, file: File): Promise<string> {
  await mkdir(PHOTO_DIR, { recursive: true });
  const ext = path.extname(file.name) || "";
  const storedName = `${taskId}-${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(PHOTO_DIR, storedName), buffer);
  return storedName;
}

/** Attach a before/after documentation photo to any cleaning task, whether
 * or not it's flagged photo_required and independent of completing it. */
export async function uploadCleaningPhotoAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("taskId") || "");
  const kind = formData.get("kind") === "before" ? "before" : "after";
  const photo = formData.get("photo");
  if (!id || !(photo instanceof File) || photo.size === 0) return { error: "Choose a photo first." };
  const photoRef = await storePhotoFile(id, photo);
  cleaningService.attachCleaningPhoto(id, kind, photoRef, user);
  refresh();
  return { ok: true };
}

/** Bulk-enter a whole cleaning chart at once: repeating rows of area/task/
 * frequency/weekday, each finding-or-creating its area by name so the whole
 * chart can be typed in without pre-setting up areas first. Row N's fields
 * are named area_N/category_N/title_N/frequency_N/weekday_N/photoRequired_N. */
export async function bulkAddCleaningTasksAction(formData: FormData): Promise<{ error?: string; count?: number }> {
  const user = await requireCurrentUser();
  const rowCount = Number(formData.get("rowCount") || 0);
  let created = 0;
  for (let i = 0; i < rowCount; i++) {
    const areaName = String(formData.get(`area_${i}`) || "").trim();
    const title = String(formData.get(`title_${i}`) || "").trim();
    if (!areaName || !title) continue; // skip blank rows -- not every row gets filled in
    const category = (String(formData.get(`category_${i}`) || "FOH") as "FOH" | "BOH" | "FACILITIES");
    const frequency = String(formData.get(`frequency_${i}`) || "DAILY") === "WEEKLY" ? "WEEKLY" : "DAILY";
    const weekdayRaw = String(formData.get(`weekday_${i}`) || "");
    const weekday = frequency === "WEEKLY" && weekdayRaw !== "" ? Number(weekdayRaw) : null;
    const photoRequired = formData.get(`photoRequired_${i}`) === "on";

    const areaId = cleaningService.findOrCreateCleaningArea(user.storeId, areaName, category, user);
    cleaningService.createCleaningTask({ areaId, title, frequency, weekday, photoRequired, actor: user });
    created++;
  }
  if (created === 0) return { error: "Fill in at least one row (area + task) before saving." };
  refresh();
  return { count: created };
}

/** Re-sync from the weekly rotation content file after the company chart
 * changes -- only adds items missing by title, safe to call repeatedly. */
export async function loadWeeklyCleaningRotationAction(): Promise<{ added: number }> {
  const user = await requireCurrentUser();
  const added = cleaningService.loadWeeklyCleaningRotation(user.storeId, user);
  refresh();
  return { added };
}

export async function setCleaningAreaOwnerAction(areaId: string, ownerId: string) {
  const user = await requireCurrentUser();
  cleaningService.setCleaningAreaOwner(areaId, ownerId || null, user);
  refresh();
}

export async function setCleaningTaskAssociateAction(taskId: string, associateName: string) {
  const user = await requireCurrentUser();
  cleaningService.setCleaningTaskAssociate(taskId, associateName.trim() || null, user);
  refresh();
}

export async function verifyCleaningAction(id: string) {
  const user = await requireCurrentUser();
  cleaningService.verifyCleaningTask(id, user);
  refresh();
}

export async function reopenCleaningAction(id: string) {
  const user = await requireCurrentUser();
  cleaningService.reopenCleaningTask(id, user);
  refresh();
}
