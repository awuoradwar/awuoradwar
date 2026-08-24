import { Language } from "./types";

// Parallel arrays -- index i in one is the translation of index i in the
// other. Shared by the add form, the edit form, and anywhere a waste log
// entry's unit gets displayed, so the list (and its translations) can't
// drift out of sync between them.
export const UNITS_EN = ["lb", "oz", "each", "case", "bag", "tray", "gallon"];
export const UNITS_ES = ["lb", "oz", "unidad", "caja", "bolsa", "charola", "galón"];

/** "batch"/"party tray" are stored the same way as any other unit (in the
 * quantity + unit columns) but aren't offered in the plain Unit list above
 * -- they're a separate measure ("how many cooking batches", not "how many
 * lb/oz"), picked from BATCH_SIZES below via its own toggle on the form.
 * Kept here only so translateWasteUnit can still translate them wherever an
 * existing entry gets displayed. */
const BATCH_UNITS_EN = ["batch", "party tray"];
const BATCH_UNITS_ES = ["tanda", "charola grande"];

export interface BatchPreset {
  quantity: number;
  unit: string;
  labelEn: string;
  labelEs: string;
}

/** Quick-tap shortcuts for the four cooking-batch amounts a manager
 * actually logs -- each one fills in BOTH the Quantity and Unit fields at
 * once (e.g. "#2" -> Quantity 2, Unit batch), but Quantity stays a normal,
 * separately editable field afterward (e.g. tap "#1" then change Quantity
 * to 3 for three batches). Unit itself is always just "batch" or "party
 * tray" -- never "double batch"/"half batch" as if those were their own
 * units, which read as a confusing compound once paired with an
 * independent quantity (e.g. "2 double batch"). */
export const BATCH_SIZES: BatchPreset[] = [
  { quantity: 0.5, unit: "batch", labelEn: "#1/2", labelEs: "#1/2" },
  { quantity: 1, unit: "batch", labelEn: "#1", labelEs: "#1" },
  { quantity: 2, unit: "batch", labelEn: "#2", labelEs: "#2" },
  { quantity: 1, unit: "party tray", labelEn: "Party Tray", labelEs: "Charola grande" },
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
