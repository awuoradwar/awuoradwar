import { Language } from "./types";

// Parallel arrays -- index i in one is the translation of index i in the
// other. Shared by the add form, the edit form, and every place a
// borrowed/lent item's unit gets displayed.
export const UNITS_EN = ["case", "sleeve", "bag", "box", "bottle", "bucket", "each"];
export const UNITS_ES = ["caja", "manga", "bolsa", "caja chica", "botella", "cubeta", "unidad"];

/** A unit is stored exactly as picked at entry time -- "caja" if the person
 * logging it was on Spanish, "case" if they were on English -- so it never
 * automatically matched whichever language a *later* viewer happens to be
 * using. Translates a preset unit to the current viewer's language
 * regardless of which language it was originally saved in; a custom
 * free-typed unit ("Other...") isn't one of the presets in either language,
 * so it's returned unchanged since there's nothing to translate it against. */
export function translateUnit(unit: string | null, lang: Language): string | null {
  if (!unit) return unit;
  const enIndex = UNITS_EN.indexOf(unit);
  if (enIndex !== -1) return lang === "es" ? UNITS_ES[enIndex] : unit;
  const esIndex = UNITS_ES.indexOf(unit);
  if (esIndex !== -1) return lang === "en" ? UNITS_EN[esIndex] : unit;
  return unit;
}
