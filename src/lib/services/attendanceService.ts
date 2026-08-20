import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";

export type AttendanceType = "CALL_IN" | "LATE" | "NO_SHOW" | "LEFT_EARLY" | "SENT_HOME";

export function recordAttendanceEvent(params: {
  storeId: string;
  shiftId?: string | null;
  employeeName: string;
  type: AttendanceType;
  eventDate?: string | null;
  scheduledTime?: string | null;
  actualTime?: string | null;
  notifiedAt?: string | null;
  notificationMethod?: string | null;
  coverageStatus?: string | null;
  coveringPerson?: string | null;
  note?: string | null;
  actor: SessionUser;
  picId?: string | null;
  idempotencyKey?: string;
}) {
  return withIdempotency("attendance_event", params.idempotencyKey, () => insertAttendanceEvent(params));
}

function insertAttendanceEvent(params: {
  storeId: string;
  shiftId?: string | null;
  employeeName: string;
  type: AttendanceType;
  eventDate?: string | null;
  scheduledTime?: string | null;
  actualTime?: string | null;
  notifiedAt?: string | null;
  notificationMethod?: string | null;
  coverageStatus?: string | null;
  coveringPerson?: string | null;
  note?: string | null;
  actor: SessionUser;
  picId?: string | null;
}) {
  const db = getDb();
  const id = newId();
  let minutesLate: number | null = null;
  if (params.type === "LATE" && params.scheduledTime && params.actualTime) {
    const sched = new Date(params.scheduledTime).getTime();
    const actual = new Date(params.actualTime).getTime();
    minutesLate = Math.max(0, Math.round((actual - sched) / 60000));
  }
  db.prepare(
    `INSERT INTO attendance_events (id, store_id, shift_id, employee_name, type, event_date, scheduled_time, actual_time,
      minutes_late, notified_at, notification_method, coverage_status, covering_person, note, recorded_by, pic_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.shiftId || null,
    params.employeeName,
    params.type,
    params.eventDate || null,
    params.scheduledTime || null,
    params.actualTime || null,
    minutesLate,
    params.notifiedAt || null,
    params.notificationMethod || null,
    params.coverageStatus || null,
    params.coveringPerson || null,
    params.note || null,
    params.actor.id,
    params.picId || null,
    nowIso()
  );
  writeAudit({ entityType: "attendance_event", entityId: id, actor: params.actor, picId: params.picId, action: "CREATED", newValue: { type: params.type, employeeName: params.employeeName } });
  return id;
}

export function getRecentAttendanceEvents(storeId: string, limit = 20) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM attendance_events WHERE store_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(storeId, limit);
}

export interface AttendanceEventRow {
  id: string;
  employee_name: string;
  type: AttendanceType;
  event_date: string | null;
  scheduled_time: string | null;
  actual_time: string | null;
  minutes_late: number | null;
  notified_at: string | null;
  notification_method: string | null;
  coverage_status: string | null;
  covering_person: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

/** Scoped to storeId so one store can never fetch another's attendance record. */
export function getAttendanceEvent(id: string, storeId: string): AttendanceEventRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM attendance_events WHERE id = ? AND store_id = ?`).get(id, storeId) as AttendanceEventRow | undefined;
}

/** Fix a typo, wrong date/time, or coverage detail after the fact -- these
 * had no edit path at all before, only create. */
export function updateAttendanceEvent(
  id: string,
  params: {
    employeeName: string;
    eventDate: string | null;
    scheduledTime: string | null;
    actualTime: string | null;
    notifiedAt: string | null;
    notificationMethod: string | null;
    coverageStatus: string | null;
    coveringPerson: string | null;
    note: string | null;
  },
  actor: SessionUser
) {
  const db = getDb();
  let minutesLate: number | null = null;
  if (params.scheduledTime && params.actualTime) {
    const sched = new Date(params.scheduledTime).getTime();
    const actual = new Date(params.actualTime).getTime();
    if (!Number.isNaN(sched) && !Number.isNaN(actual)) minutesLate = Math.max(0, Math.round((actual - sched) / 60000));
  }
  db.prepare(
    `UPDATE attendance_events SET employee_name = ?, event_date = ?, scheduled_time = ?, actual_time = ?, minutes_late = ?,
      notified_at = ?, notification_method = ?, coverage_status = ?, covering_person = ?, note = ? WHERE id = ?`
  ).run(
    params.employeeName,
    params.eventDate,
    params.scheduledTime,
    params.actualTime,
    minutesLate,
    params.notifiedAt,
    params.notificationMethod,
    params.coverageStatus,
    params.coveringPerson,
    params.note,
    id
  );
  writeAudit({ entityType: "attendance_event", entityId: id, actor, action: "EDITED", newValue: params });
}
