"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import * as storeProfileService from "@/lib/services/storeProfileService";

// Same private-storage pattern as cleaning photos and schedule-request
// attachments: a real file on disk outside public/, only reachable through
// the authenticated /api/store-pnl/[periodId] route.
const PNL_DIR = path.join(process.cwd(), "data", "private-uploads", "store-pnl");

function num(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function refresh() {
  revalidatePath("/more/store-profile");
  revalidatePath("/my-shift");
}

export async function createStorePeriodAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canDo(user, "store_profile.manage")) return { error: "FORBIDDEN" };

  const periodLabel = String(formData.get("periodLabel") || "").trim();
  if (!periodLabel) return { error: "Period label is required." };

  let pnlFileRef: string | null = null;
  const file = formData.get("pnlFile");
  if (file instanceof File && file.size > 0) {
    await mkdir(PNL_DIR, { recursive: true });
    const ext = path.extname(file.name) || "";
    const storedName = `${user.storeId}-${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(PNL_DIR, storedName), buffer);
    pnlFileRef = storedName;
  }

  storeProfileService.createPeriod({
    storeId: user.storeId,
    periodLabel,
    netSalesActual: num(formData, "netSalesActual"),
    netSalesPlan: num(formData, "netSalesPlan"),
    netSalesPriorYear: num(formData, "netSalesPriorYear"),
    sssPct: num(formData, "sssPct"),
    sstPct: num(formData, "sstPct"),
    checkAverage: num(formData, "checkAverage"),
    cogsPct: num(formData, "cogsPct"),
    laborPct: num(formData, "laborPct"),
    controllableProfitActual: num(formData, "controllableProfitActual"),
    controllableProfitPct: num(formData, "controllableProfitPct"),
    restaurantContribution: num(formData, "restaurantContribution"),
    gemScore: num(formData, "gemScore"),
    pnlFileRef,
    notes: String(formData.get("notes") || "").trim() || null,
    actor: user,
  });

  refresh();
  return { ok: true };
}
