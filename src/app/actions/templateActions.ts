"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { newId, nowIso, writeAudit } from "@/lib/audit";

export async function createTemplateAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const recurrenceType = String(formData.get("recurrenceType") || "WEEKLY");
  const weekdaysRaw = formData.getAll("weekdays").map(String);
  const dueTime = String(formData.get("dueTime") || "") || undefined;
  const config = { weekdays: weekdaysRaw.map(Number), dueTime };
  const id = newId();
  db.prepare(
    `INSERT INTO task_templates (id, store_id, title, description, area, category, recurrence_type, recurrence_config,
      default_owner_position, effort, verification_required, source, active, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, 0, 'manual', 1, ?)`
  ).run(
    id,
    user.storeId,
    title,
    String(formData.get("area") || "") || null,
    String(formData.get("category") || "ROUTINE"),
    recurrenceType,
    JSON.stringify(config),
    String(formData.get("effort") || "STANDARD"),
    nowIso()
  );
  writeAudit({ entityType: "task_template", entityId: id, actor: user, action: "CREATED", newValue: { title } });
  revalidatePath("/more/templates");
  return { ok: true };
}

export async function toggleTemplateActiveAction(id: string, active: boolean) {
  const user = await requireCurrentUser();
  if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  db.prepare(`UPDATE task_templates SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
  writeAudit({ entityType: "task_template", entityId: id, actor: user, action: "EDITED", newValue: { active } });
  revalidatePath("/more/templates");
}
