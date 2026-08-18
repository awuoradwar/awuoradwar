"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { newId, nowIso, writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { Position } from "@/lib/types";
import { invalidateStoreTimezone } from "@/lib/storeTime";

export async function createUserAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canDo(user, "users.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const position = String(formData.get("position") || "ASSISTANT_MANAGER") as Position;
  if (!name || !email) return { error: "Name and email are required." };

  const existing = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).get(email);
  if (existing) return { error: "A user with that email already exists." };

  const id = newId();
  const passwordHash = await hashPassword("shiftops123");
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, position, language, active, created_at) VALUES (?, ?, ?, ?, ?, 'en', 1, ?)`
  ).run(id, name, email, passwordHash, position, nowIso());
  db.prepare(`INSERT INTO store_memberships (id, user_id, store_id, role, active) VALUES (?, ?, ?, ?, 1)`).run(
    newId(),
    id,
    user.storeId,
    position
  );
  writeAudit({ entityType: "user", entityId: id, actor: user, action: "CREATED", newValue: { name, position } });
  revalidatePath("/more/admin");
  return { ok: true, temporaryPassword: "shiftops123" };
}

export async function deactivateUserAction(userId: string) {
  const user = await requireCurrentUser();
  if (!canDo(user, "users.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  db.prepare(`UPDATE users SET active = 0 WHERE id = ?`).run(userId);
  writeAudit({ entityType: "user", entityId: userId, actor: user, action: "EDITED", newValue: { active: false } });
  revalidatePath("/more/admin");
}

export async function updateUserAction(userId: string, formData: FormData): Promise<{ error?: string }> {
  const user = await requireCurrentUser();
  if (!canDo(user, "users.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const position = String(formData.get("position") || "") as Position;
  if (!name || !email) return { error: "Name and email are required." };

  const existing = db.prepare(`SELECT id FROM users WHERE lower(email) = ? AND id != ?`).get(email, userId);
  if (existing) return { error: "A user with that email already exists." };

  db.prepare(`UPDATE users SET name = ?, email = ?, position = ? WHERE id = ?`).run(name, email, position, userId);
  db.prepare(`UPDATE store_memberships SET role = ? WHERE user_id = ?`).run(position, userId);
  writeAudit({ entityType: "user", entityId: userId, actor: user, action: "EDITED", newValue: { name, email, position } });
  revalidatePath("/more/admin");
  revalidatePath("/", "layout");
  return {};
}

/** Wipes activity/instance data left over from testing (tasks, meal
 * replacements, issues, borrowed items, attendance, training records,
 * acknowledgements, P&L periods, audit history, etc.) while keeping
 * everything that represents real ongoing setup: logins, the store
 * profile, recurring task templates, the inventory/maintenance catalog,
 * and cleaning area/checklist definitions. cleaning_tasks rows are reset
 * to ASSIGNED rather than deleted since the row IS the checklist item. */
export async function resetTestDataAction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireCurrentUser();
  if (!canDo(user, "store.configure")) throw new Error("FORBIDDEN");
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== "RESET") return { error: 'Type RESET (all caps) to confirm.' };

  const db = getDb();
  const storeId = user.storeId;
  const reset = db.transaction(() => {
    db.prepare(`DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM tasks WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM issue_updates WHERE issue_id IN (SELECT id FROM issues WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM issues WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM guest_recoveries WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM borrowed_items WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM acknowledgement_completions WHERE acknowledgement_id IN (SELECT id FROM acknowledgements WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM acknowledgements WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM attendance_events WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM shifts WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM manager_shifts WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM training_completions WHERE trainee_id IN (SELECT id FROM trainees WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM training_sessions WHERE trainee_id IN (SELECT id FROM trainees WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM trainees WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM store_pnl_periods WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM meeting_actions WHERE meeting_id IN (SELECT id FROM meetings WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM meeting_week_state WHERE meeting_id IN (SELECT id FROM meetings WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM schedule_request_attachments WHERE request_id IN (SELECT id FROM schedule_requests WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM schedule_request_events WHERE request_id IN (SELECT id FROM schedule_requests WHERE store_id = ?)`).run(storeId);
    db.prepare(`DELETE FROM schedule_conflicts WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM schedule_requests WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM shift_notes WHERE store_id = ?`).run(storeId);
    db.prepare(`DELETE FROM handoffs WHERE store_id = ?`).run(storeId);
    db.prepare(
      `DELETE FROM audit_events WHERE entity_type IN (
        'task', 'attendance_event', 'acknowledgement', 'acknowledgement_completion', 'manager_shift',
        'schedule_request', 'borrowed_item', 'trainee', 'handoff', 'shift', 'guest_recovery', 'issue',
        'store_pnl_period', 'shift_note', 'cleaning_task'
      )`
    ).run();
    db.prepare(
      `UPDATE cleaning_tasks SET status = 'ASSIGNED', completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL, photo_url = NULL
       WHERE area_id IN (SELECT id FROM cleaning_areas WHERE store_id = ?)`
    ).run(storeId);
  });
  reset();

  revalidatePath("/", "layout");
  return {};
}

export async function updateStoreProfileAction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireCurrentUser();
  if (!canDo(user, "store.configure")) throw new Error("FORBIDDEN");
  const name = String(formData.get("name") || "").trim();
  const timezone = String(formData.get("timezone") || "").trim();
  if (!name || !timezone) return { error: "Store name and timezone are required." };
  const db = getDb();
  db.prepare(`UPDATE stores SET name = ?, timezone = ? WHERE id = ?`).run(name, timezone, user.storeId);
  invalidateStoreTimezone(user.storeId);
  writeAudit({ entityType: "store", entityId: user.storeId, actor: user, action: "EDITED", newValue: { name, timezone } });
  revalidatePath("/more/settings");
  revalidatePath("/", "layout");
  return {};
}
