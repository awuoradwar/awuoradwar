import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export function createScheduleRequest(params: {
  storeId: string;
  associateName: string;
  requestType: string;
  requestedStartDate: string;
  requestedEndDate?: string;
  requestedStartTime?: string;
  requestedEndTime?: string;
  receivedVia: string;
  notes?: string;
  actor: SessionUser; // received_by / entered_by
  gmSelfDeciding?: boolean;
}) {
  const db = getDb();
  const id = newId();
  const status = params.gmSelfDeciding ? "APPROVED" : "PENDING_GM_APPROVAL";
  db.prepare(
    `INSERT INTO schedule_requests (id, store_id, associate_name, request_type, requested_start_date, requested_end_date,
      requested_start_time, requested_end_time, received_via, received_by, entered_by, notes, status,
      gm_decision_by, gm_decision_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.associateName,
    params.requestType,
    params.requestedStartDate,
    params.requestedEndDate || null,
    params.requestedStartTime || null,
    params.requestedEndTime || null,
    params.receivedVia,
    params.actor.id,
    params.actor.id,
    params.notes || null,
    status,
    params.gmSelfDeciding ? params.actor.id : null,
    params.gmSelfDeciding ? nowIso() : null,
    nowIso()
  );
  writeAudit({ entityType: "schedule_request", entityId: id, actor: params.actor, action: "CREATED", newValue: { associate: params.associateName, type: params.requestType } });
  return id;
}

export function addAttachment(requestId: string, fileRef: string, attachmentType: string, actor: SessionUser) {
  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO schedule_request_attachments (id, request_id, file_ref, attachment_type, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, requestId, fileRef, attachmentType, actor.id, nowIso());
  writeAudit({ entityType: "schedule_request", entityId: requestId, actor, action: "EDITED", newValue: { attachment: fileRef } });
  return id;
}

/** Fix the request's own details after the fact -- wrong date, typo'd
 * associate name, wrong type -- separate from decideRequest, which only
 * ever changes the approval status. Editable regardless of status so a
 * mistake caught after a decision was made can still be corrected. */
export function updateScheduleRequest(
  id: string,
  params: {
    associateName: string;
    requestType: string;
    requestedStartDate: string;
    requestedEndDate: string | null;
    requestedStartTime: string | null;
    requestedEndTime: string | null;
    notes: string | null;
  },
  actor: SessionUser
) {
  const db = getDb();
  db.prepare(
    `UPDATE schedule_requests SET associate_name = ?, request_type = ?, requested_start_date = ?, requested_end_date = ?,
      requested_start_time = ?, requested_end_time = ?, notes = ? WHERE id = ?`
  ).run(
    params.associateName,
    params.requestType,
    params.requestedStartDate,
    params.requestedEndDate,
    params.requestedStartTime,
    params.requestedEndTime,
    params.notes,
    id
  );
  writeAudit({ entityType: "schedule_request", entityId: id, actor, action: "EDITED", newValue: params });
}

export function decideRequest(requestId: string, decision: "APPROVED" | "DENIED", actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE schedule_requests SET status = ?, gm_decision_by = ?, gm_decision_at = ? WHERE id = ?`).run(decision, actor.id, ts, requestId);
  writeAudit({ entityType: "schedule_request", entityId: requestId, actor, action: decision === "APPROVED" ? "APPROVED" : "DENIED" });
}

export function getPendingQueue(storeId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT sr.*, rb.name as received_by_name, (SELECT COUNT(*) FROM schedule_request_attachments a WHERE a.request_id = sr.id) as attachment_count
       FROM schedule_requests sr LEFT JOIN users rb ON rb.id = sr.received_by
       WHERE sr.store_id = ? AND sr.status = 'PENDING_GM_APPROVAL' ORDER BY sr.created_at ASC`
    )
    .all(storeId);
}

export function getAllRequests(storeId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT sr.*, rb.name as received_by_name, (SELECT COUNT(*) FROM schedule_request_attachments a WHERE a.request_id = sr.id) as attachment_count
       FROM schedule_requests sr LEFT JOIN users rb ON rb.id = sr.received_by
       WHERE sr.store_id = ? ORDER BY sr.created_at DESC`
    )
    .all(storeId);
}

/** Latest attachment for a request, scoped to storeId so one store can never fetch another's file. */
export function getLatestAttachmentForRequest(requestId: string, storeId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.file_ref, a.attachment_type FROM schedule_request_attachments a
       JOIN schedule_requests sr ON sr.id = a.request_id
       WHERE a.request_id = ? AND sr.store_id = ? ORDER BY a.created_at DESC LIMIT 1`
    )
    .get(requestId, storeId) as { file_ref: string; attachment_type: string | null } | undefined;
}

/** Check a proposed shift date/time for an associate against approved requests & availability. */
export function checkConflict(storeId: string, associateName: string, shiftDate: string, startTime?: string, endTime?: string) {
  const db = getDb();
  const approvedOff = db
    .prepare(
      `SELECT * FROM schedule_requests WHERE store_id = ? AND associate_name = ? AND status = 'APPROVED'
       AND requested_start_date <= ? AND COALESCE(requested_end_date, requested_start_date) >= ?`
    )
    .all(storeId, associateName, shiftDate, shiftDate) as Array<{ request_type: string; requested_start_time: string | null; requested_end_time: string | null }>;

  const pending = db
    .prepare(
      `SELECT * FROM schedule_requests WHERE store_id = ? AND associate_name = ? AND status = 'PENDING_GM_APPROVAL'
       AND requested_start_date <= ? AND COALESCE(requested_end_date, requested_start_date) >= ?`
    )
    .all(storeId, associateName, shiftDate, shiftDate);

  const conflicts: Array<{ type: string; severity: string; message: string }> = [];
  for (const req of approvedOff) {
    if (req.request_type === "FULL_DAY_OFF") {
      conflicts.push({ type: "APPROVED_OFF", severity: "BLOCKING", message: `${associateName} has approved time off on ${shiftDate}.` });
    } else if (["LEAVE_EARLY", "LATE_START", "PARTIAL_DAY"].includes(req.request_type) && (startTime || endTime)) {
      if (req.requested_start_time && startTime && startTime < req.requested_start_time) {
        conflicts.push({ type: "WINDOW_CONFLICT", severity: "WARNING", message: `${associateName}'s approved window starts at ${req.requested_start_time}.` });
      }
      if (req.requested_end_time && endTime && endTime > req.requested_end_time) {
        conflicts.push({ type: "WINDOW_CONFLICT", severity: "WARNING", message: `${associateName}'s approved window ends at ${req.requested_end_time}.` });
      }
    }
  }
  if (pending.length > 0) {
    conflicts.push({ type: "PENDING_REQUEST", severity: "WARNING", message: `${associateName} has a request pending GM decision for this date.` });
  }
  return conflicts;
}
