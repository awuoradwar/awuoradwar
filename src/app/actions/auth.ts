"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
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
