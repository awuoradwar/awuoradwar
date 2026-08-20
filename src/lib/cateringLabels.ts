import { Language } from "./types";

export const CATERING_CHANNEL_LABEL: Record<string, { en: string; es: string }> = {
  OLO: { en: "OLO (online ordering)", es: "OLO (pedido en línea)" },
  EZCATERING: { en: "EZCater", es: "EZCater" },
  IN_STORE: { en: "In-Store", es: "En Tienda" },
  PHONE: { en: "Phone", es: "Teléfono" },
};

export function cateringChannelLabel(channel: string, lang: Language): string {
  return CATERING_CHANNEL_LABEL[channel]?.[lang] || channel;
}
