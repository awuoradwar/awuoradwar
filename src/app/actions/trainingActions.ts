"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import * as trainingService from "@/lib/services/trainingService";
import { TrainingPosition, TrainingShiftType } from "@/lib/services/trainingService";

function refresh(traineeId?: string) {
  revalidatePath("/more/training");
  if (traineeId) revalidatePath(`/more/training/${traineeId}`);
}

export async function addTrainingItemAction(position: TrainingPosition, title: string, titleEs: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "training_items.manage")) throw new Error("FORBIDDEN");
  if (!title.trim()) return { error: "Title is required." };
  trainingService.addTrainingItem(user.storeId, position, title.trim(), titleEs.trim() || null, user);
  refresh();
  return { ok: true };
}

export async function removeTrainingItemAction(id: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "training_items.manage")) throw new Error("FORBIDDEN");
  trainingService.removeTrainingItem(id, user);
  refresh();
}

export async function createTraineeAction(name: string, position: TrainingPosition) {
  const user = await requireCurrentUser();
  if (!name.trim()) return { error: "Name is required." };
  const id = trainingService.createTrainee(user.storeId, name.trim(), position, user);
  refresh();
  return { ok: true, id };
}

export async function toggleTrainingItemAction(traineeId: string, trainingItemId: string) {
  const user = await requireCurrentUser();
  const trainee = trainingService.getTraineeDetail(traineeId, user.storeId);
  if (!trainee) throw new Error("NOT_FOUND");
  trainingService.toggleTrainingItem(traineeId, trainingItemId, user);
  refresh(traineeId);
}

export async function markTraineeCompleteAction(traineeId: string) {
  const user = await requireCurrentUser();
  const trainee = trainingService.getTraineeDetail(traineeId, user.storeId);
  if (!trainee) throw new Error("NOT_FOUND");
  trainingService.markTraineeComplete(traineeId, user);
  refresh(traineeId);
}

export async function scheduleTrainingSessionAction(traineeId: string, date: string, shiftType: TrainingShiftType, managerId: string) {
  const user = await requireCurrentUser();
  const trainee = trainingService.getTraineeDetail(traineeId, user.storeId);
  if (!trainee) throw new Error("NOT_FOUND");
  if (!date) return { error: "Date is required." };
  trainingService.scheduleTrainingSession(traineeId, date, shiftType, managerId || null, user);
  refresh(traineeId);
  return { ok: true };
}

export async function removeTrainingSessionAction(sessionId: string, traineeId: string) {
  const user = await requireCurrentUser();
  const trainee = trainingService.getTraineeDetail(traineeId, user.storeId);
  if (!trainee) throw new Error("NOT_FOUND");
  trainingService.removeTrainingSession(sessionId, traineeId, user);
  refresh(traineeId);
}
