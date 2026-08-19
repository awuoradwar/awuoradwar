"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth";
import { requireGM } from "@/lib/permissions";
import * as schedulingService from "@/lib/services/schedulingService";

function refresh() {
  revalidatePath("/more/scheduling");
}

// Private, non-public-served storage (public/ is what Next.js exposes directly;
// this lives outside it and is only reachable through the authenticated
// /api/schedule-attachments/[requestId] route below).
const ATTACHMENT_DIR = path.join(process.cwd(), "data", "private-uploads", "schedule-requests");

export async function createScheduleRequestAction(formData: FormData) {
  const user = await requireCurrentUser();
  const associateName = String(formData.get("associateName") || "").trim();
  const requestType = String(formData.get("requestType") || "");
  const requestedStartDate = String(formData.get("requestedStartDate") || "");
  if (!associateName || !requestType || !requestedStartDate) {
    return { error: "Associate, request type and date are required." };
  }
  const requestId = schedulingService.createScheduleRequest({
    storeId: user.storeId,
    associateName,
    requestType,
    requestedStartDate,
    requestedEndDate: String(formData.get("requestedEndDate") || "") || undefined,
    requestedStartTime: String(formData.get("requestedStartTime") || "") || undefined,
    requestedEndTime: String(formData.get("requestedEndTime") || "") || undefined,
    receivedVia: String(formData.get("receivedVia") || "OTHER"),
    notes: String(formData.get("notes") || "") || undefined,
    actor: user,
    gmSelfDeciding: user.position === "GM" && formData.get("gmDecideNow") === "on",
  });

  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    await mkdir(ATTACHMENT_DIR, { recursive: true });
    const ext = path.extname(file.name) || "";
    const storedName = `${requestId}-${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(ATTACHMENT_DIR, storedName), buffer);
    schedulingService.addAttachment(requestId, storedName, String(formData.get("attachmentType") || "FILE"), user);
  }

  refresh();
  return { ok: true };
}

export async function updateScheduleRequestAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") || "");
  const associateName = String(formData.get("associateName") || "").trim();
  const requestType = String(formData.get("requestType") || "");
  const requestedStartDate = String(formData.get("requestedStartDate") || "");
  if (!id || !associateName || !requestType || !requestedStartDate) {
    return { error: "Associate, request type and date are required." };
  }
  schedulingService.updateScheduleRequest(
    id,
    {
      associateName,
      requestType,
      requestedStartDate,
      requestedEndDate: String(formData.get("requestedEndDate") || "").trim() || null,
      requestedStartTime: String(formData.get("requestedStartTime") || "").trim() || null,
      requestedEndTime: String(formData.get("requestedEndTime") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
    },
    user
  );
  refresh();
  return { ok: true };
}

export async function decideRequestAction(requestId: string, decision: "APPROVED" | "DENIED") {
  const user = await requireCurrentUser();
  requireGM(user);
  schedulingService.decideRequest(requestId, decision, user);
  refresh();
}

export async function checkConflictAction(
  associateName: string,
  shiftDate: string,
  startTime?: string,
  endTime?: string
) {
  const user = await requireCurrentUser();
  return schedulingService.checkConflict(user.storeId, associateName, shiftDate, startTime || undefined, endTime || undefined);
}
