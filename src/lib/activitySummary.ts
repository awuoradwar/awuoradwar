import { Language } from "./types";

/** Labels for the field names that show up in audit_events.old_value /
 * new_value across services (a mix of camelCase JS param names and a few
 * snake_case DB column names, since writeAudit just JSON.stringifies
 * whatever each service passed it). Anything not listed here still shows,
 * just humanized from its raw key instead of translated. */
const FIELD_LABELS: Record<string, { en: string; es: string }> = {
  employeeName: { en: "Employee", es: "Empleado" },
  eventDate: { en: "Date", es: "Fecha" },
  scheduledTime: { en: "Scheduled time", es: "Hora programada" },
  actualTime: { en: "Actual time", es: "Hora real" },
  coverageStatus: { en: "Coverage", es: "Cobertura" },
  coveringPerson: { en: "Covering", es: "Cubre" },
  note: { en: "Note", es: "Nota" },
  direction: { en: "Direction", es: "Dirección" },
  borrowedFrom: { en: "From", es: "De" },
  item: { en: "Item", es: "Artículo" },
  quantity: { en: "Quantity", es: "Cantidad" },
  unit: { en: "Unit", es: "Unidad" },
  approvedByName: { en: "Approved by", es: "Aprobado por" },
  pickedUpByName: { en: "Picked up by", es: "Recogido por" },
  pickedUpAt: { en: "Picked up at", es: "Recogido el" },
  dueAt: { en: "Due", es: "Vence" },
  status: { en: "Status", es: "Estado" },
  resolution: { en: "Resolution", es: "Resolución" },
  description: { en: "Description", es: "Descripción" },
  severity: { en: "Severity", es: "Gravedad" },
  category: { en: "Category", es: "Categoría" },
  dueDate: { en: "Due date", es: "Fecha límite" },
  title: { en: "Title", es: "Título" },
  associateName: { en: "Associate", es: "Asociado" },
  associate: { en: "Associate", es: "Asociado" },
  requestType: { en: "Request type", es: "Tipo de solicitud" },
  requestedStartDate: { en: "Start date", es: "Fecha de inicio" },
  requestedEndDate: { en: "End date", es: "Fecha de fin" },
  requestedStartTime: { en: "Start time", es: "Hora de inicio" },
  requestedEndTime: { en: "End time", es: "Hora de fin" },
  notes: { en: "Notes", es: "Notas" },
  settlement_method: { en: "Settlement method", es: "Método de liquidación" },
  replacement_status: { en: "Replacement status", es: "Estado del reemplazo" },
  follow_up_task_id: { en: "Follow-up task", es: "Tarea de seguimiento" },
  stock_count: { en: "Stock count", es: "Conteo de stock" },
  on_order: { en: "On order", es: "En pedido" },
};

function humanizeKey(key: string, lang: Language): string {
  const known = FIELD_LABELS[key];
  if (known) return known[lang];
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown, lang: Language): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? (lang === "es" ? "Sí" : "Yes") : "No";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const s = String(value);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

const MAX_FIELDS = 3;

/** A short "what changed" line for one activity entry, built from whatever
 * old_value/new_value the writing service captured. Most services only ever
 * snapshot the new state (no old_value), so most entries read as "Field:
 * value, Field: value" -- the current state, not a true diff. Where a
 * service does capture both (e.g. an issue status change), fields present
 * in both render as "Field: old → new" and unchanged fields are dropped.
 * Returns null when there's nothing to show. */
export function summarizeActivityChange(oldValueRaw: unknown, newValueRaw: unknown, lang: Language): string | null {
  let oldValue: Record<string, unknown> | null = null;
  let newValue: Record<string, unknown> | null = null;
  try {
    oldValue = oldValueRaw ? (JSON.parse(String(oldValueRaw)) as Record<string, unknown>) : null;
  } catch {
    oldValue = null;
  }
  try {
    newValue = newValueRaw ? (JSON.parse(String(newValueRaw)) as Record<string, unknown>) : null;
  } catch {
    newValue = null;
  }
  if (!newValue || typeof newValue !== "object") return null;

  const keys = Object.keys(newValue);
  if (keys.length === 0) return null;

  const parts: string[] = [];
  for (const key of keys) {
    if (parts.length >= MAX_FIELDS) break;
    const label = humanizeKey(key, lang);
    const newVal = formatValue(newValue[key], lang);
    if (oldValue && key in oldValue) {
      const oldVal = formatValue(oldValue[key], lang);
      if (oldVal === newVal) continue;
      parts.push(`${label}: ${oldVal} → ${newVal}`);
    } else {
      parts.push(`${label}: ${newVal}`);
    }
  }
  if (parts.length === 0) return null;
  const more = keys.length > MAX_FIELDS ? ` (+${keys.length - MAX_FIELDS})` : "";
  return parts.join(" · ") + more;
}
