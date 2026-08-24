import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getNoteAttachmentRef } from "@/lib/services/noteService";

const ATTACHMENT_DIR = path.join(process.cwd(), "data", "private-uploads", "shift-notes");

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/note-attachments/[attachmentId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { attachmentId } = await ctx.params;
  const file = getNoteAttachmentRef(attachmentId, user.storeId);
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const filePath = path.join(ATTACHMENT_DIR, file.file_ref);
    if (!filePath.startsWith(ATTACHMENT_DIR)) return new Response("Not found", { status: 404 });
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": file.content_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${file.file_ref}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
