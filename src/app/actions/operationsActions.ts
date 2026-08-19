"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import * as guestRecoveryService from "@/lib/services/guestRecoveryService";
import * as borrowingService from "@/lib/services/borrowingService";
import * as issueService from "@/lib/services/issueService";
import * as acknowledgementService from "@/lib/services/acknowledgementService";
import { storeLocalIso } from "@/lib/storeTime";

function refresh() {
  revalidatePath("/my-shift");
  revalidatePath("/handoff");
  revalidatePath("/more/reports");
  revalidatePath("/more/search");
  revalidatePath("/more/acknowledgements");
  revalidatePath("/more/work-orders");
}

export async function approveReplacementAction(id: string) {
  const user = await requireCurrentUser();
  guestRecoveryService.approveReplacement(id, user);
  refresh();
}

export async function completeReplacementAction(id: string) {
  const user = await requireCurrentUser();
  guestRecoveryService.completeReplacement(id, user);
  refresh();
}

export async function markNotRequiredAction(id: string) {
  const user = await requireCurrentUser();
  guestRecoveryService.markNotRequired(id, user);
  refresh();
}

export async function addGuestRecoveryFollowUpAction(id: string, title: string) {
  const user = await requireCurrentUser();
  guestRecoveryService.addFollowUpTask(id, user.storeId, title, user);
  refresh();
}

export async function updateBorrowedItemAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") || "");
  const borrowedFrom = String(formData.get("borrowedFrom") || "").trim();
  const item = String(formData.get("item") || "").trim();
  if (!id || !borrowedFrom || !item) return { error: "Store and item are required." };
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const direction = String(formData.get("direction") || "") === "LENT" ? "LENT" : "BORROWED";
  const pickedUpAtLocal = String(formData.get("pickedUpAt") || ""); // datetime-local: "YYYY-MM-DDTHH:MM"
  const pickedUpAt = pickedUpAtLocal ? storeLocalIso(user.storeId, pickedUpAtLocal.slice(0, 10), pickedUpAtLocal.slice(11, 16)) : null;
  const dueAtLocal = String(formData.get("dueAt") || ""); // datetime-local: "YYYY-MM-DDTHH:MM"
  const dueAt = dueAtLocal ? storeLocalIso(user.storeId, dueAtLocal.slice(0, 10), dueAtLocal.slice(11, 16)) : null;
  borrowingService.updateBorrowedItem(
    id,
    {
      direction,
      borrowedFrom,
      item,
      quantity: quantityRaw ? Number(quantityRaw) : null,
      unit: String(formData.get("unit") || "").trim() || null,
      approvedByName: String(formData.get("approvedByName") || "").trim() || null,
      pickedUpByName: String(formData.get("pickedUpByName") || "").trim() || null,
      pickedUpAt,
      dueAt,
    },
    user
  );
  refresh();
  return { ok: true };
}

export async function selectSettlementAction(id: string, method: "RETURN_PRODUCT" | "CRUNCHTIME_TRANSFER" | "PENDING_CONFIRMATION") {
  const user = await requireCurrentUser();
  borrowingService.selectSettlement(id, method, user);
  refresh();
}

export async function settleBorrowedItemAction(id: string, notes?: string) {
  const user = await requireCurrentUser();
  borrowingService.settleBorrowedItem(id, user, notes);
  refresh();
}

export async function updateIssueAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") || "");
  const description = String(formData.get("description") || "").trim();
  if (!id || !description) return { error: "Description is required." };
  issueService.updateIssue(
    id,
    {
      category: String(formData.get("category") || "OTHER"),
      description,
      severity: String(formData.get("severity") || "NORMAL") === "CRITICAL" ? "CRITICAL" : "NORMAL",
      dueDate: String(formData.get("dueDate") || "").trim() || null,
    },
    user
  );
  refresh();
  return { ok: true };
}

export async function addIssueUpdateAction(id: string, note: string, newStatus?: string) {
  const user = await requireCurrentUser();
  issueService.addIssueUpdate(id, note, user, newStatus);
  refresh();
}

export async function resolveIssueAction(id: string, resolution: string) {
  const user = await requireCurrentUser();
  issueService.resolveIssue(id, resolution, user);
  refresh();
}

export async function reopenIssueAction(id: string) {
  const user = await requireCurrentUser();
  issueService.reopenIssue(id, user);
  refresh();
}

export async function markAckCompletionAction(completionId: string) {
  const user = await requireCurrentUser();
  acknowledgementService.markCompletion(completionId, user);
  refresh();
}

export async function verifyAckCompletionAction(completionId: string) {
  const user = await requireCurrentUser();
  acknowledgementService.verifyCompletion(completionId, user);
  refresh();
}
