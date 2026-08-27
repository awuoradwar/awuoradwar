"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { newId, nowIso, writeAudit } from "@/lib/audit";
import { activeTemplateTitleExists } from "@/lib/services/taskService";
import { translateFields, resolveBilingualPair } from "@/lib/services/translationService";

export async function createTemplateAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  const titleTyped = String(formData.get("title") || "").trim();
  if (!titleTyped) return { error: "Title is required." };
  const titleEsTyped = String(formData.get("titleEs") || "").trim() || null;
  const translated = titleEsTyped ? {} : await translateFields({ title: titleTyped });
  const { primary: title, secondary: titleEs } = resolveBilingualPair(translated?.title, titleTyped, titleEsTyped);
  if (activeTemplateTitleExists(user.storeId, title)) {
    return { error: `A recurring task named "${title}" already exists. Edit that one instead of adding a duplicate.` };
  }
  const recurrenceType = String(formData.get("recurrenceType") || "WEEKLY");
  const weekdaysRaw = formData.getAll("weekdays").map(String);
  const dueTimesRaw = formData
    .getAll("dueTime")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const config = { weekdays: weekdaysRaw.map(Number), dueTimes: dueTimesRaw.length > 0 ? dueTimesRaw : undefined };
  const id = newId();
  db.prepare(
    `INSERT INTO task_templates (id, store_id, title, title_es, description, area, category, recurrence_type, recurrence_config,
      default_owner_position, effort, verification_required, source, active, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, 0, 'manual', 1, ?)`
  ).run(
    id,
    user.storeId,
    title,
    titleEs,
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

/** Fill in or fix a template's title after the fact -- title_es has always
 * been on the schema, but nothing ever let a manager actually set it, so
 * templates created before this stayed English-only for Spanish viewers. */
export async function updateTemplateTitleAction(id: string, formData: FormData) {
  const user = await requireCurrentUser();
  if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  const titleTyped = String(formData.get("title") || "").trim();
  if (!titleTyped) return { error: "Title is required." };
  const titleEsTyped = String(formData.get("titleEs") || "").trim() || null;
  const translated = titleEsTyped ? {} : await translateFields({ title: titleTyped });
  const { primary: title, secondary: titleEs } = resolveBilingualPair(translated?.title, titleTyped, titleEsTyped);
  db.prepare(`UPDATE task_templates SET title = ?, title_es = ? WHERE id = ?`).run(title, titleEs, id);
  writeAudit({ entityType: "task_template", entityId: id, actor: user, action: "EDITED", newValue: { title, title_es: titleEs } });
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

/**
 * Change when a recurring template fires -- which weekday(s) and what time.
 * Only affects instances generated from here forward: ensureInstancesForDate
 * (recurrenceService.ts) re-reads the template fresh on every call and only
 * ever inserts a new row when one doesn't already exist for that
 * template+date, so already-materialized past/today instances are never
 * rewritten -- exactly "the schedule changed going forward," not a rewrite
 * of history.
 */
export async function updateTemplateScheduleAction(id: string, formData: FormData) {
  const user = await requireCurrentUser();
  if (!canDo(user, "templates.manage")) throw new Error("FORBIDDEN");
  const db = getDb();
  const recurrenceType = String(formData.get("recurrenceType") || "WEEKLY");
  const weekdaysRaw = formData.getAll("weekdays").map(String);
  const dueTimesRaw = formData
    .getAll("dueTime")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const existing = db.prepare(`SELECT recurrence_config FROM task_templates WHERE id = ?`).get(id) as
    | { recurrence_config: string | null }
    | undefined;
  const prevConfig = existing?.recurrence_config ? JSON.parse(existing.recurrence_config) : {};
  const linkScheduleRequests = formData.get("linkScheduleRequests") === "on";
  const config = {
    ...prevConfig,
    weekdays: weekdaysRaw.map(Number),
    dueTimes: dueTimesRaw.length > 0 ? dueTimesRaw : undefined,
    dueTime: undefined, // superseded by dueTimes -- drop the legacy singular key on any re-save
    linkScheduleRequests,
  };
  db.prepare(`UPDATE task_templates SET recurrence_type = ?, recurrence_config = ? WHERE id = ?`).run(
    recurrenceType,
    JSON.stringify(config),
    id
  );
  writeAudit({
    entityType: "task_template",
    entityId: id,
    actor: user,
    action: "EDITED",
    newValue: { recurrence_type: recurrenceType, recurrence_config: config },
  });
  revalidatePath("/more/templates");
  return { ok: true };
}
