"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import * as procedureService from "@/lib/services/procedureService";
import { ProcedureCategory, ProcedureShiftType, ProcedureSubmissionItem } from "@/lib/services/procedureService";

function refresh() {
  revalidatePath("/more/procedures");
}

// --- Public: no login, called from src/app/procedures/[token] --------------

/** The public checklist's only write path. Trusts nothing from the client
 * except the token and what the associate typed -- areaId is re-validated
 * against the token's own store, not assumed, so a crafted request can
 * never write a submission into a different store than the link is for. */
export async function submitProcedureAction(
  token: string,
  areaId: string,
  shiftType: ProcedureShiftType,
  associateName: string,
  items: ProcedureSubmissionItem[],
  notes: string
): Promise<{ id?: string; error?: string }> {
  const store = procedureService.getStoreByProceduresToken(token);
  if (!store) return { error: "This link is no longer valid." };
  const area = procedureService.getArea(areaId, store.id);
  if (!area) return { error: "That area isn't available anymore. Refresh and try again." };
  return procedureService.submitProcedure({ storeId: store.id, areaId, shiftType, associateName, items, notes });
}

// --- GM management -----------------------------------------------------

export async function regenerateProceduresLinkAction(): Promise<{ token?: string; error?: string }> {
  const user = await requireCurrentUser();
  if (!canDo(user, "procedures.manage")) throw new Error("FORBIDDEN");
  const token = procedureService.regenerateProceduresToken(user.storeId, user);
  refresh();
  return { token };
}

export async function createAreaAction(formData: FormData): Promise<{ id?: string; error?: string }> {
  const user = await requireCurrentUser();
  if (!canDo(user, "procedures.manage")) throw new Error("FORBIDDEN");
  const name = String(formData.get("name") || "");
  const category = String(formData.get("category") || "") as ProcedureCategory;
  if (!["FOH", "BOH", "PATIO_WINDOWS"].includes(category)) return { error: "Invalid category." };
  const result = procedureService.createArea(user.storeId, name, category, user);
  if (!result.error) refresh();
  return result;
}

export async function deactivateAreaAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "procedures.manage")) throw new Error("FORBIDDEN");
  procedureService.deactivateArea(id, user);
  refresh();
}

export async function addProcedureItemAction(areaId: string, shiftType: ProcedureShiftType, text: string, textEs: string): Promise<{ id?: string; error?: string }> {
  const user = await requireCurrentUser();
  if (!canDo(user, "procedures.manage")) throw new Error("FORBIDDEN");
  const result = procedureService.addItem(areaId, shiftType, text, textEs, user);
  if (!result.error) refresh();
  return result;
}

export async function removeProcedureItemAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "procedures.manage")) throw new Error("FORBIDDEN");
  procedureService.removeItem(id, user);
  refresh();
}
