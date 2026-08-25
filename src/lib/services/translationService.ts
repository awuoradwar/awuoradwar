import "server-only";
import Anthropic from "@anthropic-ai/sdk";

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
