"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { newId, nowIso, writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { Position } from "@/lib/types";

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
