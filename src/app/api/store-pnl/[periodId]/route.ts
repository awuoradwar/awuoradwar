import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getPnlFileRef } from "@/lib/services/storeProfileService";

const PNL_DIR = path.join(process.cwd(), "data", "private-uploads", "store-pnl");

// application/octet-stream forces a silent download in most in-app browsers
// (including the standalone PWA's), which reads as a blank page since
// nothing ever renders -- the actual file type needs to be reported so the
// browser knows to display a PDF/image inline instead.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
  ".webp": "image/webp",
};

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/store-pnl/[periodId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { periodId } = await ctx.params;
  const file = getPnlFileRef(periodId, user.storeId);
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const filePath = path.join(PNL_DIR, file.pnl_file_ref);
    if (!filePath.startsWith(PNL_DIR)) return new Response("Not found", { status: 404 });
    const data = await readFile(filePath);
    const contentType = CONTENT_TYPE_BY_EXT[path.extname(file.pnl_file_ref).toLowerCase()] || "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${file.pnl_file_ref}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
