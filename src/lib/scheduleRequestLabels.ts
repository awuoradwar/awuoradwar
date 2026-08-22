import { Language } from "./types";

export const SCHEDULE_REQUEST_TYPE_LABEL: Record<string, { en: string; es: string }> = {
  FULL_DAY_OFF: { en: "Full day off", es: "Día completo libre" },
  LEAVE_EARLY: { en: "Leave early", es: "Salir temprano" },
  LATE_START: { en: "Late start", es: "Inicio tardío" },
  PARTIAL_DAY: { en: "Partial day", es: "Día parcial" },
  TEMP_AVAILABILITY_CHANGE: { en: "Temporary availability change", es: "Cambio temporal de disponibilidad" },
  SHIFT_SWAP: { en: "Shift swap", es: "Cambio de turno" },
  OTHER: { en: "Other", es: "Otro" },
};

export function scheduleRequestTypeLabel(type: string, lang: Language): string {
  return SCHEDULE_REQUEST_TYPE_LABEL[type]?.[lang] || type.replace(/_/g, " ");
}
