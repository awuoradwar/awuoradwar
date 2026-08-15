import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getLatestAttachmentForRequest } from "@/lib/services/schedulingService";

const ATTACHMENT_DIR = path.join(process.cwd(), "data", "private-uploads", "schedule-requests");

// Private, authenticated file serving: only a logged-in manager at the SAME
// store as the schedule request can fetch its attachment. This is the
// signed-URL/private-object-storage requirement standing in for real cloud
// storage while running on local SQLite for development.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/schedule-attachments/[requestId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { requestId } = await ctx.params;
  const attachment = getLatestAttachmentForRequest(requestId, user.storeId);
  if (!attachment) return new Response("Not found", { status: 404 });

  try {
    const filePath = path.join(ATTACHMENT_DIR, attachment.file_ref);
    if (!filePath.startsWith(ATTACHMENT_DIR)) return new Response("Not found", { status: 404 });
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${attachment.file_ref}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
