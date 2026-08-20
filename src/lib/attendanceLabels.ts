import { Language } from "./types";

export const ATTENDANCE_TYPE_LABEL: Record<string, { en: string; es: string }> = {
  CALL_IN: { en: "Call-in", es: "Aviso de ausencia" },
  LATE: { en: "Late", es: "Tardanza" },
  NO_SHOW: { en: "No Show", es: "No se presentó" },
  LEFT_EARLY: { en: "Left Early", es: "Se fue temprano" },
  SENT_HOME: { en: "Sent Home", es: "Enviado a casa" },
};

export function attendanceTypeLabel(type: string, lang: Language): string {
  return ATTENDANCE_TYPE_LABEL[type]?.[lang] || type;
}

export const NOTIFICATION_METHOD_LABEL: Record<string, { en: string; es: string }> = {
  PHONE_CALL: { en: "Phone call", es: "Llamada" },
  TEXT: { en: "Text", es: "Mensaje de texto" },
  APP: { en: "App", es: "App" },
  IN_PERSON: { en: "In person", es: "En persona" },
  OTHER: { en: "Other", es: "Otro" },
};

export function notificationMethodLabel(method: string, lang: Language): string {
  return NOTIFICATION_METHOD_LABEL[method]?.[lang] || method;
}
