import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { windowForHour } from "./taskService";
import { resolveShiftOwnerForWindow } from "./scheduleService";
import { storeLocalIso } from "../storeTime";

export interface RecurrenceConfig {
  weekdays?: number[]; // 0=Sun..6=Sat, used for WEEKLY/WEEKDAYS/CUSTOM
  dueTime?: string; // 'HH:MM' store-local
  dependsOnTemplateTitle?: string;
  conditionalMeetingType?: string;
  everyNWeeks?: number; // for BIWEEKLY math relative to an epoch
}

function matchesToday(recurrenceType: string, config: RecurrenceConfig, date: Date): boolean {
  // `date` is always built at UTC midnight for the target dateStr (see
  // ensureInstancesForDate) -- read it back with the UTC getters, not the
  // local-timezone ones. getDay()/getDate() interpret the instant in the
  // server process's own local timezone, which silently shifts the weekday
  // by a day whenever that's not UTC (any self-hosted deployment not
  // running its Node process in UTC), breaking every WEEKLY/WEEKDAYS/
  // BIWEEKLY/MONTHLY template while DAILY (which ignores weekday) masked it.
  const weekday = date.getUTCDay();
  switch (recurrenceType) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return weekday >= 1 && weekday <= 5;
    case "WEEKLY":
    case "CUSTOM":
      return (config.weekdays || []).includes(weekday);
    case "BIWEEKLY": {
      if (!(config.weekdays || []).includes(weekday)) return false;
      const epoch = new Date("2026-01-04T00:00:00Z"); // a Sunday reference point
      const diffWeeks = Math.floor((date.getTime() - epoch.getTime()) / (7 * 86400000));
      return diffWeeks % 2 === 0;
    }
    case "MONTHLY":
      return date.getUTCDate() === 1;
    case "ONE_TIME":
      return false; // one-time tasks are created directly, never generated
    default:
      return false;
  }
}

/**
 * Idempotently ensure that recurring task instances exist for `date` at
 * `storeId`. Safe to call on every My Shift / Week page load -- it only
 * inserts an instance when one doesn't already exist for that
 * template+date, so re-running never duplicates records.
 */
export function ensureInstancesForDate(storeId: string, dateStr: string) {
  const db = getDb();
  const date = new Date(dateStr + "T00:00:00Z");
  const templates = db
    .prepare(`SELECT * FROM task_templates WHERE store_id = ? AND active = 1`)
    .all(storeId) as Array<{
    id: string;
    title: string;
    description: string | null;
    area: string | null;
    category: string | null;
    recurrence_type: string;
    recurrence_config: string | null;
    default_owner_position: string | null;
    effort: string;
    verification_required: number;
    checklist_role: string | null;
  }>;

  for (const tpl of templates) {
    const config: RecurrenceConfig = tpl.recurrence_config ? JSON.parse(tpl.recurrence_config) : {};
    if (!matchesToday(tpl.recurrence_type, config, date)) continue;

    const existing = db
      .prepare(`SELECT id FROM tasks WHERE template_id = ? AND scheduled_date = ?`)
      .get(tpl.id, dateStr);
    if (existing) continue;

    let dependsOnTaskId: string | null = null;
    if (config.dependsOnTemplateTitle) {
      const depTpl = db
        .prepare(`SELECT id FROM task_templates WHERE store_id = ? AND title = ?`)
        .get(storeId, config.dependsOnTemplateTitle) as { id: string } | undefined;
      if (depTpl) {
        const depTask = db
          .prepare(`SELECT id FROM tasks WHERE template_id = ? AND scheduled_date = ?`)
          .get(depTpl.id, dateStr) as { id: string } | undefined;
        if (depTask) dependsOnTaskId = depTask.id;
      }
    }

    const dueAt = config.dueTime ? storeLocalIso(storeId, dateStr, config.dueTime) : null;
    // Recurring instances default to unassigned -- a manager assigns on the
    // day of if needed (the owner dropdown on the Week page), rather than
    // the system guessing from who happens to be scheduled. Only a
    // template that explicitly specifies a default owner position opts
    // back into auto-resolving from the schedule.
    // windowForHour wants the store-local hour -- config.dueTime is already store-local
    // wall-clock ("11:00" means 11am at the store), so parse it directly rather than
    // re-deriving from dueAt (which is now a real UTC instant in the server's own zone).
    const ownerId =
      tpl.default_owner_position && config.dueTime
        ? resolveShiftOwnerForWindow(storeId, dateStr, windowForHour(Number(config.dueTime.split(":")[0])))
        : null;
    const ownerAutoAssigned = ownerId ? 1 : 0;
    const id = newId();
    db.prepare(
      `INSERT INTO tasks (id, store_id, template_id, title, description, area, category, owner_id, owner_auto_assigned, support_ids,
        due_at, scheduled_for, scheduled_date, effort, priority, severity, status, verification_required,
        depends_on_task_id, source, checklist_role, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'DATE', ?, ?, 'NORMAL', 'NORMAL', 'OPEN', ?, ?, 'recurring', ?, NULL, ?)`
    ).run(
      id,
      storeId,
      tpl.id,
      tpl.title,
      tpl.description,
      tpl.area,
      tpl.category,
      ownerId,
      ownerAutoAssigned,
      dueAt,
      dateStr,
      tpl.effort,
      tpl.verification_required,
      dependsOnTaskId,
      tpl.checklist_role,
      nowIso()
    );
    writeAudit({
      entityType: "task",
      entityId: id,
      actor: null,
      action: "CREATED",
      newValue: { title: tpl.title, source: "recurring", scheduled_date: dateStr },
    });
  }
}

export function ensureInstancesForWeek(storeId: string, weekStartStr: string) {
  const start = new Date(weekStartStr + "T00:00:00Z");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    ensureInstancesForDate(storeId, d.toISOString().slice(0, 10));
  }
}

/** Sunday-start of the week containing `dateStr`. */
export function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getDay();
  const start = new Date(d.getTime() - day * 86400000);
  return start.toISOString().slice(0, 10);
}
