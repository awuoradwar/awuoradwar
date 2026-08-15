import enRaw from "./en";
import esRaw from "./es";
import type { DictKeys } from "./en";
import type { Language } from "../types";

export type Dict = Record<DictKeys, string>;
const en: Dict = enRaw;
const es: Dict = esRaw;

const dicts: Record<Language, Dict> = { en, es };

export function getDict(lang: Language): Dict {
  return dicts[lang] || en;
}

export function t(lang: Language, key: keyof Dict): string {
  return dicts[lang]?.[key] ?? dicts.en[key] ?? String(key);
}
