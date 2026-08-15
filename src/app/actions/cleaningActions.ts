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

/** Completion with a required photo. Takes FormData (not raw args) so the
 * File survives the client->server-action boundary reliably. */
export async function completeCleaningWithPhotoAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("taskId") || "");
  if (!id) return { error: "Missing task id." };
  const photo = formData.get("photo");
  let photoRef: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    await mkdir(PHOTO_DIR, { recursive: true });
    const ext = path.extname(photo.name) || "";
    const storedName = `${id}-${randomUUID()}${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());
    await writeFile(path.join(PHOTO_DIR, storedName), buffer);
    photoRef = storedName;
  }
  try {
    cleaningService.completeCleaningTask(id, user, photoRef);
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^PHOTO_REQUIRED: /, "") : "Could not complete task." };
  }
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
