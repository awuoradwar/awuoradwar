import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db";

export interface FieldTranslation {
  lang: "en" | "es";
  translated: string;
}

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  // No key configured (this deploy hasn't set one up yet) -- translation is
  // best-effort on top of everything else, never a hard requirement for
  // saving a task or note, so this just quietly disables it rather than
  // erroring on every save.
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return client;
}

const SYSTEM_PROMPT = `You translate short text fields for a restaurant shift-management app, between English and Spanish, for a Panda Express back-of-house/front-of-house team.

You will receive a JSON object mapping field names to text. For each field:
- Detect whether the text is written in English or Spanish.
- Translate it into the OTHER language -- natural, workplace-appropriate, no more formal than the original.
- Keep it terse if the original is terse (a task title stays a title, not a sentence).
- Preserve names of people, numbers, times, and restaurant-specific terms (e.g. "DLMT", "Workjam", product names) rather than translating them.
- If a field is empty, purely numeric/symbolic, or has no real translatable content, return it unchanged and report its language as "en".

Respond with ONLY a JSON object, no prose, no markdown code fences, matching exactly this shape:
{"<fieldName>": {"lang": "en"|"es", "translated": "<the other language's version>"}, ...}
One entry per field name you were given, in the same field names.`;

/** Translates a batch of labeled text fields in one call -- e.g. a task's
 * title and description together, or a note's title plus every section's
 * topic/subtopic/bullets. Returns null (never throws) on any failure --
 * missing API key, network error, malformed response -- so a translation
 * hiccup never blocks saving the task or note itself; the fields simply
 * save as typed, exactly like before this feature existed. */
export async function translateFields(fields: Record<string, string>): Promise<Record<string, FieldTranslation> | null> {
  const entries = Object.entries(fields).filter(([, v]) => v && v.trim());
  if (entries.length === 0) return {};

  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(Object.fromEntries(entries)) }],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) return null;
    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(raw) as Record<string, { lang?: string; translated?: string }>;
    const result: Record<string, FieldTranslation> = {};
    for (const [key] of entries) {
      const entry = parsed[key];
      if (!entry || typeof entry.translated !== "string") continue;
      result[key] = { lang: entry.lang === "es" ? "es" : "en", translated: entry.translated };
    }
    return result;
  } catch (err) {
    console.error("translateFields failed", err);
    return null;
  }
}

/** Given a field the manager typed into a primary input (e.g. "title") and
 * whatever they optionally typed into its Spanish companion (e.g.
 * "titleEs"), decides what actually lands in each DB column -- always
 * primary=English, secondary=Spanish, matching every display component's
 * existing convention, regardless of which language was actually typed
 * into the primary field. If the manager already filled in both fields
 * themselves, their input is trusted as-is and translation is skipped for
 * that field entirely (the caller shouldn't even include it in the
 * translateFields() call). */
export function resolveBilingualPair(
  translated: FieldTranslation | undefined,
  primaryTyped: string,
  secondaryTyped: string | null
): { primary: string; secondary: string | null } {
  if (secondaryTyped) return { primary: primaryTyped, secondary: secondaryTyped };
  if (!translated) return { primary: primaryTyped, secondary: null };
  if (translated.lang === "es") return { primary: translated.translated, secondary: primaryTyped };
  return { primary: primaryTyped, secondary: translated.translated };
}

const BACKFILL_LIMIT = 25;

/** Catches up anything that was saved before auto-translation existed (or
 * before an API key was configured) -- active recurring templates, open
 * one-off tasks, and notes whose title still has no Spanish counterpart.
 * Cheap to call on every page load: when nothing is missing (the normal
 * case) it's just three small SELECTs and no API call at all. When there IS
 * something to catch up, everything found is translated in one shared
 * call rather than one request per row. Safe to call with no API key --
 * translateFields() returns null and this simply does nothing that trip. */
export async function backfillStoreTranslations(storeId: string): Promise<void> {
  const db = getDb();

  const templates = db
    .prepare(`SELECT id, title FROM task_templates WHERE store_id = ? AND active = 1 AND title_es IS NULL LIMIT ?`)
    .all(storeId, BACKFILL_LIMIT) as Array<{ id: string; title: string }>;
  const tasks = db
    .prepare(
      `SELECT id, title, description FROM tasks WHERE store_id = ? AND template_id IS NULL AND title_es IS NULL AND status IN ('OPEN','IN_PROGRESS') LIMIT ?`
    )
    .all(storeId, BACKFILL_LIMIT) as Array<{ id: string; title: string; description: string | null }>;
  const notes = db
    .prepare(`SELECT id, title FROM shift_notes WHERE store_id = ? AND title IS NOT NULL AND title_es IS NULL LIMIT ?`)
    .all(storeId, BACKFILL_LIMIT) as Array<{ id: string; title: string }>;

  if (templates.length === 0 && tasks.length === 0 && notes.length === 0) return;

  const toTranslate: Record<string, string> = {};
  templates.forEach((t) => (toTranslate[`tpl_${t.id}`] = t.title));
  tasks.forEach((t) => {
    toTranslate[`task_${t.id}`] = t.title;
    if (t.description) toTranslate[`taskdesc_${t.id}`] = t.description;
  });
  notes.forEach((n) => (toTranslate[`note_${n.id}`] = n.title));

  const translated = await translateFields(toTranslate);
  if (!translated) return;

  const updateTemplate = db.prepare(`UPDATE task_templates SET title_es = ? WHERE id = ? AND title_es IS NULL`);
  const updateTask = db.prepare(`UPDATE tasks SET title_es = ? WHERE id = ? AND title_es IS NULL`);
  const updateTaskDesc = db.prepare(`UPDATE tasks SET description_es = ? WHERE id = ? AND description_es IS NULL`);
  const updateNote = db.prepare(`UPDATE shift_notes SET title_es = ? WHERE id = ? AND title_es IS NULL`);

  for (const t of templates) {
    const entry = translated[`tpl_${t.id}`];
    if (entry) updateTemplate.run(entry.lang === "es" ? t.title : entry.translated, t.id);
  }
  for (const t of tasks) {
    const entry = translated[`task_${t.id}`];
    if (entry) updateTask.run(entry.lang === "es" ? t.title : entry.translated, t.id);
    const descEntry = translated[`taskdesc_${t.id}`];
    if (descEntry) updateTaskDesc.run(descEntry.lang === "es" ? t.description : descEntry.translated, t.id);
  }
  for (const n of notes) {
    const entry = translated[`note_${n.id}`];
    if (entry) updateNote.run(entry.lang === "es" ? n.title : entry.translated, n.id);
  }
}
