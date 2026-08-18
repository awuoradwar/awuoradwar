"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword, hashPassword } from "@/lib/auth";
import { Language, User } from "@/lib/types";

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password." };

  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE lower(email) = ? AND active = 1`).get(email) as User | undefined;
  if (!user) return { error: "login_error" };

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: "login_error" };

  const membership = db
    .prepare(`SELECT store_id FROM store_memberships WHERE user_id = ? AND active = 1 LIMIT 1`)
    .get(user.id) as { store_id: string } | undefined;
  if (!membership) return { error: "login_error" };

  await createSession(user.id, membership.store_id);
  redirect("/my-shift");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function setLanguageAction(lang: Language) {
  const user = await getCurrentUser();
  if (!user) return;
  const db = getDb();
  db.prepare(`UPDATE users SET language = ? WHERE id = ?`).run(lang, user.id);
  revalidatePath("/", "layout");
}

export async function updateMyNameAction(name: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const db = getDb();
  db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(trimmed, user.id);
  revalidatePath("/", "layout");
  return {};
}

export async function updateMyEmailAction(email: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "Email is required." };
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM users WHERE lower(email) = ? AND id != ?`).get(trimmed, user.id);
  if (existing) return { error: "A user with that email already exists." };
  db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(trimmed, user.id);
  revalidatePath("/", "layout");
  return {};
}

export async function changeMyPasswordAction(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (newPassword.length < 6) return { error: "New password must be at least 6 characters." };
  const db = getDb();
  const row = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(user.id) as { password_hash: string };
  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) return { error: "Current password is incorrect." };
  const newHash = await hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(newHash, user.id);
  return {};
}
