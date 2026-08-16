"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import * as importService from "@/lib/services/importService";
import * as taskService from "@/lib/services/taskService";
import * as cleaningService from "@/lib/services/cleaningService";

function refresh() {
  revalidatePath("/more/inbox");
  revalidatePath("/week");
  revalidatePath("/more/cleaning");
}

export async function ingestTextAction(formData: FormData) {
  const user = await requireCurrentUser();
  const filename = String(formData.get("filename") || "Pasted company plan");
  const text = String(formData.get("text") || "").trim();
  if (!text) return { error: "Paste or type the company plan text first." };
  importService.ingestDocument({ storeId: user.storeId, filename, fileType: "text", originalText: text, actor: user });
  refresh();
  return { ok: true };
}

export async function approveProposalAction(
  proposalId: string,
  correctedTitle: string,
  createTask: boolean,
  ownerId?: string | null,
  cleaningAreaId?: string | null,
  cleaningFrequency?: "DAILY" | "WEEKLY"
) {
  const user = await requireCurrentUser();
  importService.approveProposal(proposalId, correctedTitle, user);
  if (createTask && cleaningAreaId) {
    // A real cleaning task tied to an area -- trackable/verifiable on the
    // Cleaning page -- rather than a generic task, since that's where the
    // team expects company-provided cleaning duties to show up.
    cleaningService.createCleaningTask({
      areaId: cleaningAreaId,
      title: correctedTitle,
      frequency: cleaningFrequency || "DAILY",
      managerOwnerId: ownerId || user.id,
      actor: user,
    });
  } else if (createTask) {
    taskService.createTask({
      storeId: user.storeId,
      title: correctedTitle,
      scheduledFor: "LATER_THIS_WEEK",
      ownerId: ownerId || null,
      actor: user,
    });
  }
  refresh();
}

export async function rejectProposalAction(proposalId: string) {
  const user = await requireCurrentUser();
  importService.rejectProposal(proposalId, user);
  refresh();
}
