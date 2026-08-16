"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import * as guestRecoveryService from "@/lib/services/guestRecoveryService";
import * as borrowingService from "@/lib/services/borrowingService";
import * as issueService from "@/lib/services/issueService";
import * as acknowledgementService from "@/lib/services/acknowledgementService";

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
