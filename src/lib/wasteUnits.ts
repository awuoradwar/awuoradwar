import { Language } from "./types";

// Parallel arrays -- index i in one is the translation of index i in the
// other. Shared by the add form, the edit form, and anywhere a waste log
// entry's unit gets displayed, so the list (and its translations) can't
// drift out of sync between them. "batch" covers a cooking-batch quantity
// (0.5, 1, 2 batches -- the Quantity field already takes decimals, so a
// half batch is just "0.5"); "party tray" is its own size, distinct from
// the smaller "tray" already in the list.
export const UNITS_EN = ["lb", "oz", "each", "case", "bag", "tray", "party tray", "batch", "gallon"];
export const UNITS_ES = ["lb", "oz", "unidad", "caja", "bolsa", "charola", "charola grande", "tanda", "galón"];

/** A unit is stored exactly as picked at entry time -- in whichever
 * language the person logging it was using -- so it never automatically
 * matched whichever language a *later* viewer happens to be on. Translates
 * a preset unit to the current viewer's language regardless of which
 * language it was originally saved in. */
export function translateWasteUnit(unit: string | null, lang: Language): string | null {
  if (!unit) return unit;
  const enIndex = UNITS_EN.indexOf(unit);
  if (enIndex !== -1) return lang === "es" ? UNITS_ES[enIndex] : unit;
  const esIndex = UNITS_ES.indexOf(unit);
  if (esIndex !== -1) return lang === "en" ? UNITS_EN[esIndex] : unit;
  return unit;
}
