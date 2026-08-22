"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth";
import * as attendanceService from "@/lib/services/attendanceService";

// Same private-storage pattern as quickAddActions.ts's call-in/late upload --
// a real file on disk outside public/, only reachable through the
// authenticated /api/attendance-attachments/[eventId] route.
const ATTACHMENT_DIR = path.join(process.cwd(), "data", "private-uploads", "attendance");

async function storeAttendanceAttachment(storeId: string, formData: FormData): Promise<string | null> {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size === 0) return null;
  await mkdir(ATTACHMENT_DIR, { recursive: true });
  const ext = path.extname(file.name) || "";
  const storedName = `${storeId}-${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(ATTACHMENT_DIR, storedName), buffer);
  return storedName;
}

function refresh() {
  revalidatePath("/my-shift");
  revalidatePath("/handoff");
  revalidatePath("/more/attendance");
}

export async function updateAttendanceEventAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") || "");
  const employeeName = String(formData.get("employeeName") || "").trim();
  if (!id || !employeeName) return { error: "Employee name is required." };
  const attachmentRef = await storeAttendanceAttachment(user.storeId, formData);
  attendanceService.updateAttendanceEvent(
    id,
    {
      employeeName,
      eventDate: String(formData.get("eventDate") || "").trim() || null,
      scheduledTime: String(formData.get("scheduledTime") || "").trim() || null,
      actualTime: String(formData.get("actualTime") || "").trim() || null,
      notifiedAt: String(formData.get("notifiedAt") || "").trim() || null,
      notificationMethod: String(formData.get("notificationMethod") || "").trim() || null,
      ...(attachmentRef ? { attachmentRef } : {}),
      coverageStatus: String(formData.get("coverageStatus") || "").trim() || null,
      coveringPerson: String(formData.get("coveringPerson") || "").trim() || null,
      note: String(formData.get("note") || "").trim() || null,
    },
    user
  );
  refresh();
  return { ok: true };
}

export async function addAttendanceFollowupAction(eventId: string, formData: FormData) {
  const user = await requireCurrentUser();
  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note is required." };
  attendanceService.addAttendanceFollowup(eventId, note, user);
  refresh();
  return { ok: true };
}
