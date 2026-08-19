import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser, Language } from "../types";
import { storeToday } from "../storeTime";

const ISSUE_CATEGORY_LABEL: Record<string, Record<Language, string>> = {
  EQUIPMENT: { en: "Equipment", es: "Equipo" },
  FACILITIES: { en: "Facilities", es: "Instalaciones" },
  OPERATIONAL: { en: "Operational", es: "Operativo" },
  OTHER: { en: "Other", es: "Otro" },
};

const GUEST_RECOVERY_CATEGORY_LABEL: Record<string, Record<Language, string>> = {
  FOOD_QUALITY: { en: "Food Quality", es: "Calidad de Alimentos" },
  ACCURACY: { en: "Accuracy", es: "Exactitud" },
  SERVICE: { en: "Service", es: "Servicio" },
  CLEANLINESS: { en: "Cleanliness", es: "Limpieza" },
  OTHER: { en: "Other", es: "Otro" },
};

const REPLACEMENT_STATUS_LABEL: Record<string, Record<Language, string>> = {
  PENDING: { en: "Pending", es: "Pendiente" },
  APPROVED: { en: "Approved", es: "Aprobado" },
  COMPLETED: { en: "Completed", es: "Completado" },
  NOT_REQUIRED: { en: "Not Required", es: "No Requerido" },
};

export interface HandoffSummary {
  staffing: Array<{ id: string; employee_name: string; type: string; note: string | null; created_at: string }>;
  completedHighValue: Array<{ title: string; completed_by_name: string | null }>;
  unresolved: Array<{ kind: string; title: string }>;
  openItems: Array<{ kind: string; title: string; id: string; created_at: string }>;
  upcoming: Array<{ title: string; due_at: string | null }>;
}

export function buildLiveSummary(storeId: string, lang: Language = "en"): HandoffSummary {
  const db = getDb();
  const today = storeToday(storeId);

  const staffing = db
    .prepare(`SELECT id, employee_name, type, note, created_at FROM attendance_events WHERE store_id = ? AND created_at LIKE ? ORDER BY created_at DESC`)
    .all(storeId, `${today}%`) as Array<{ id: string; employee_name: string; type: string; note: string | null; created_at: string }>;

  const completedHighValue = db
    .prepare(
      `SELECT t.title, u.name as completed_by_name FROM tasks t LEFT JOIN users u ON u.id = t.completed_by
       WHERE t.store_id = ? AND t.status = 'COMPLETE' AND t.effort != 'QUICK' AND t.completed_at LIKE ?
       ORDER BY t.completed_at DESC LIMIT 10`
    )
    .all(storeId, `${today}%`) as Array<{ title: string; completed_by_name: string | null }>;

  const unresolvedTasks = db
    .prepare(`SELECT title FROM tasks WHERE store_id = ? AND status IN ('OPEN','IN_PROGRESS')`)
    .all(storeId) as Array<{ title: string }>;
  const unresolvedCleaning = db
    .prepare(
      `SELECT ct.title, ct.title_es FROM cleaning_tasks ct JOIN cleaning_areas a ON a.id = ct.area_id
       WHERE a.store_id = ? AND ct.status IN ('ASSIGNED','REOPENED')`
    )
    .all(storeId) as Array<{ title: string; title_es: string | null }>;
  const unresolvedAcks = db
    .prepare(
      `SELECT a.title, COUNT(*) as outstanding FROM acknowledgements a
       JOIN acknowledgement_completions c ON c.acknowledgement_id = a.id
       WHERE a.store_id = ? AND c.completed = 0 GROUP BY a.id`
    )
    .all(storeId) as Array<{ title: string; outstanding: number }>;

  const unresolved = [
    ...unresolvedTasks.map((t) => ({ kind: "task", title: t.title })),
    ...unresolvedCleaning.map((t) => ({ kind: "cleaning", title: lang === "es" && t.title_es ? t.title_es : t.title })),
    ...unresolvedAcks.map((t) => ({
      kind: "acknowledgement",
      title: `${t.title} (${t.outstanding} ${lang === "es" ? "pendientes" : "outstanding"})`,
    })),
  ];

  const openGR = db
    .prepare(`SELECT id, issue_category, replacement_status, created_at FROM guest_recoveries WHERE store_id = ? AND replacement_status IN ('PENDING','APPROVED')`)
    .all(storeId) as Array<{ id: string; issue_category: string; replacement_status: string; created_at: string }>;
  const openIssues = db
    .prepare(`SELECT id, category, description, created_at FROM issues WHERE store_id = ? AND status NOT IN ('RESOLVED')`)
    .all(storeId) as Array<{ id: string; category: string; description: string; created_at: string }>;
  const openBorrowed = db
    .prepare(`SELECT id, item, borrowed_from, direction, created_at FROM borrowed_items WHERE store_id = ? AND status != 'SETTLED'`)
    .all(storeId) as Array<{ id: string; item: string; borrowed_from: string; direction: "BORROWED" | "LENT"; created_at: string }>;

  const openItems = [
    ...openGR.map((g) => ({
      kind: "guest_recovery",
      id: g.id,
      title: `${lang === "es" ? "Reemplazo de Comida" : "Meal Replacement"}: ${
        GUEST_RECOVERY_CATEGORY_LABEL[g.issue_category]?.[lang] || g.issue_category
      } (${REPLACEMENT_STATUS_LABEL[g.replacement_status]?.[lang] || g.replacement_status})`,
      created_at: g.created_at,
    })),
    ...openIssues.map((i) => ({
      kind: "issue",
      id: i.id,
      title: `${lang === "es" ? "Problema" : "Issue"}: ${ISSUE_CATEGORY_LABEL[i.category]?.[lang] || i.category} - ${i.description}`,
      created_at: i.created_at,
    })),
    ...openBorrowed.map((b) => ({
      kind: "borrowed_item",
      id: b.id,
      title:
        b.direction === "LENT"
          ? `${lang === "es" ? "Prestado a" : "Lent"}: ${b.item} ${lang === "es" ? "a" : "to"} ${b.borrowed_from}`
          : `${lang === "es" ? "Prestado" : "Borrowed"}: ${b.item} ${lang === "es" ? "de" : "from"} ${b.borrowed_from}`,
      created_at: b.created_at,
    })),
  ];

  const upcoming = db
    .prepare(
      `SELECT title, due_at FROM tasks WHERE store_id = ? AND status IN ('OPEN','IN_PROGRESS') AND due_at IS NOT NULL
       AND due_at >= ? ORDER BY due_at ASC LIMIT 10`
    )
    .all(storeId, nowIso()) as Array<{ title: string; due_at: string | null }>;

  return { staffing, completedHighValue, unresolved, openItems, upcoming };
}

export function generateHandoff(storeId: string, outgoingShiftId: string, outgoingPicId: string, actor: SessionUser) {
  const db = getDb();
  const summary = buildLiveSummary(storeId);
  const id = newId();
  db.prepare(
    `INSERT INTO handoffs (id, store_id, outgoing_shift_id, outgoing_pic_id, generated_summary, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'GENERATED', ?)`
  ).run(id, storeId, outgoingShiftId, outgoingPicId, JSON.stringify(summary), nowIso());
  writeAudit({ entityType: "handoff", entityId: id, actor, action: "CREATED" });
  return id;
}

export function completeOutgoingHandoff(handoffId: string, note: string | null, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE handoffs SET outgoing_note = ?, status = 'OUTGOING_COMPLETED', outgoing_completed_at = ? WHERE id = ?`).run(note, ts, handoffId);
  writeAudit({ entityType: "handoff", entityId: handoffId, actor, action: "COMPLETED", newValue: { note } });
}

export function acknowledgeHandoff(handoffId: string, incomingPicId: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE handoffs SET incoming_pic_id = ?, status = 'INCOMING_ACKNOWLEDGED', incoming_acknowledged_at = ? WHERE id = ?`).run(incomingPicId, ts, handoffId);
  writeAudit({ entityType: "handoff", entityId: handoffId, actor, action: "ACKNOWLEDGED" });
}

export function getLatestHandoff(storeId: string) {
  const db = getDb();
  return db.prepare(`SELECT h.*, uo.name as outgoing_pic_name, ui.name as incoming_pic_name FROM handoffs h
    LEFT JOIN users uo ON uo.id = h.outgoing_pic_id LEFT JOIN users ui ON ui.id = h.incoming_pic_id
    WHERE h.store_id = ? ORDER BY h.created_at DESC LIMIT 1`).get(storeId) as
    | {
        id: string;
        generated_summary: string;
        outgoing_note: string | null;
        status: string;
        outgoing_pic_name: string | null;
        incoming_pic_name: string | null;
        incoming_acknowledged_at: string | null;
      }
    | undefined;
}

/** When this user last acknowledged a handoff at this store (or 7 days ago,
 * for someone who never has) -- the natural "since you were here" boundary
 * for the live Activity feed (see activityService.getRecentActivity). */
export function getLastAcknowledgedAt(storeId: string, userId: string): string {
  const db = getDb();
  const lastAck = db
    .prepare(
      `SELECT h.incoming_acknowledged_at as ts FROM handoffs h WHERE h.store_id = ? AND h.incoming_pic_id = ? AND h.incoming_acknowledged_at IS NOT NULL
       ORDER BY h.incoming_acknowledged_at DESC LIMIT 1`
    )
    .get(storeId, userId) as { ts: string } | undefined;
  return lastAck?.ts || new Date(Date.now() - 7 * 86400000).toISOString();
}
