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
