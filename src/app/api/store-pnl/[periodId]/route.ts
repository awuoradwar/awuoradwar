import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getPnlFileRef } from "@/lib/services/storeProfileService";
import { contentTypeForFile } from "@/lib/fileContentType";

const PNL_DIR = path.join(process.cwd(), "data", "private-uploads", "store-pnl");

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
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeForFile(file.pnl_file_ref),
        "Content-Disposition": `inline; filename="${file.pnl_file_ref}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
