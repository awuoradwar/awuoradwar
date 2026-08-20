import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getAttendanceAttachmentRef } from "@/lib/services/attendanceService";

const ATTACHMENT_DIR = path.join(process.cwd(), "data", "private-uploads", "attendance");

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/attendance-attachments/[eventId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { eventId } = await ctx.params;
  const file = getAttendanceAttachmentRef(eventId, user.storeId);
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const filePath = path.join(ATTACHMENT_DIR, file.attachment_ref);
    if (!filePath.startsWith(ATTACHMENT_DIR)) return new Response("Not found", { status: 404 });
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${file.attachment_ref}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
