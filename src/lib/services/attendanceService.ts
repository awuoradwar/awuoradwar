import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit, withIdempotency } from "../audit";
import { SessionUser } from "../types";

export function recordAttendanceEvent(params: {
  storeId: string;
  shiftId?: string | null;
  employeeName: string;
  type: "CALL_IN" | "LATE" | "NO_SHOW" | "LEFT_EARLY" | "SENT_HOME";
  scheduledTime?: string | null;
  actualTime?: string | null;
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
  type: "CALL_IN" | "LATE" | "NO_SHOW" | "LEFT_EARLY" | "SENT_HOME";
  scheduledTime?: string | null;
  actualTime?: string | null;
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
    `INSERT INTO attendance_events (id, store_id, shift_id, employee_name, type, scheduled_time, actual_time,
      minutes_late, coverage_status, covering_person, note, recorded_by, pic_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.shiftId || null,
    params.employeeName,
    params.type,
    params.scheduledTime || null,
    params.actualTime || null,
    minutesLate,
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
