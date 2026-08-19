"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import * as attendanceService from "@/lib/services/attendanceService";

function refresh() {
  revalidatePath("/my-shift");
  revalidatePath("/handoff");
}

export async function updateAttendanceEventAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") || "");
  const employeeName = String(formData.get("employeeName") || "").trim();
  if (!id || !employeeName) return { error: "Employee name is required." };
  attendanceService.updateAttendanceEvent(
    id,
    {
      employeeName,
      eventDate: String(formData.get("eventDate") || "").trim() || null,
      scheduledTime: String(formData.get("scheduledTime") || "").trim() || null,
      actualTime: String(formData.get("actualTime") || "").trim() || null,
      coverageStatus: String(formData.get("coverageStatus") || "").trim() || null,
      coveringPerson: String(formData.get("coveringPerson") || "").trim() || null,
      note: String(formData.get("note") || "").trim() || null,
    },
    user
  );
  refresh();
  return { ok: true };
}
