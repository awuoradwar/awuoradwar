import { Language } from "./types";

// Parallel arrays -- index i in one is the translation of index i in the
// other. Shared by the add form, the edit form, and anywhere a waste log
// entry's unit gets displayed, so the list (and its translations) can't
// drift out of sync between them.
export const UNITS_EN = ["lb", "oz", "each", "case", "bag", "tray", "gallon"];
export const UNITS_ES = ["lb", "oz", "unidad", "caja", "bolsa", "charola", "galón"];

/** "half batch"/"batch"/"double batch"/"party tray" are stored the same way
 * as any other unit (in the quantity + unit columns) but aren't offered in
 * the plain Unit list above -- they're a separate measure ("how many
 * cooking batches", not "how many lb/oz"), picked from BATCH_SIZES below
 * via its own toggle on the form. Kept here only so translateWasteUnit can
 * still translate them wherever an existing entry gets displayed. */
const BATCH_UNITS_EN = ["half batch", "batch", "double batch", "party tray"];
const BATCH_UNITS_ES = ["media tanda", "tanda", "tanda doble", "charola grande"];

export interface BatchSize {
  unit: string;
  labelEn: string;
  labelEs: string;
}

/** The four cooking-batch sizes a manager actually logs waste in, paired
 * with a real Quantity field on the form (e.g. Quantity 3 of "#1/2" = three
 * half-batches) same as the plain Unit list gets. */
export const BATCH_SIZES: BatchSize[] = [
  { unit: "half batch", labelEn: "#1/2", labelEs: "#1/2" },
  { unit: "batch", labelEn: "#1", labelEs: "#1" },
  { unit: "double batch", labelEn: "#2", labelEs: "#2" },
  { unit: "party tray", labelEn: "Party Tray", labelEs: "Charola grande" },
];

/** A unit is stored exactly as picked at entry time -- in whichever
 * language the person logging it was using -- so it never automatically
 * matched whichever language a *later* viewer happens to be on. Translates
 * a preset unit (including batch/party tray) to the current viewer's
 * language regardless of which language it was originally saved in. */
export function translateWasteUnit(unit: string | null, lang: Language): string | null {
  if (!unit) return unit;
  const allEn = [...UNITS_EN, ...BATCH_UNITS_EN];
  const allEs = [...UNITS_ES, ...BATCH_UNITS_ES];
  const enIndex = allEn.indexOf(unit);
  if (enIndex !== -1) return lang === "es" ? allEs[enIndex] : unit;
  const esIndex = allEs.indexOf(unit);
  if (esIndex !== -1) return lang === "en" ? allEn[esIndex] : unit;
  return unit;
}
