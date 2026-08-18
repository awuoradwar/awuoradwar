import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getPhotoRefForTask } from "@/lib/services/cleaningService";

const PHOTO_DIR = path.join(process.cwd(), "data", "private-uploads", "cleaning-photos");

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cleaning-photos/[taskId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { taskId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") === "before" ? "before" : "after";
  const download = searchParams.get("download") === "1";

  const photo = getPhotoRefForTask(taskId, user.storeId, kind);
  if (!photo) return new Response("Not found", { status: 404 });

  try {
    const filePath = path.join(PHOTO_DIR, photo.photo_url);
    if (!filePath.startsWith(PHOTO_DIR)) return new Response("Not found", { status: 404 });
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${photo.photo_url}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
