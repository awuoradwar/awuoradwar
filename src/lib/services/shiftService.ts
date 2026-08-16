import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

export interface ShiftRow {
  id: string;
  store_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  pic_user_id: string | null;
  pic_name?: string | null;
  status: string;
  created_at: string;
}

/** Read-only lookup, no side effects -- safe to call on every dashboard load. */
export function getTodayShift(storeId: string, dateStr: string): ShiftRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.*, u.name as pic_name FROM shifts s LEFT JOIN users u ON u.id = s.pic_user_id
       WHERE s.store_id = ? AND s.date = ? AND s.status != 'CLOSED' ORDER BY s.created_at DESC LIMIT 1`
    )
    .get(storeId, dateStr) as ShiftRow | undefined;
}

export function getOrCreateTodayShift(storeId: string, actor: SessionUser): ShiftRow {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  let shift = db
    .prepare(
      `SELECT s.*, u.name as pic_name FROM shifts s LEFT JOIN users u ON u.id = s.pic_user_id
       WHERE s.store_id = ? AND s.date = ? AND s.status != 'CLOSED' ORDER BY s.created_at DESC LIMIT 1`
    )
    .get(storeId, today) as ShiftRow | undefined;

  if (!shift) {
    const id = newId();
    db.prepare(
      `INSERT INTO shifts (id, store_id, date, pic_user_id, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`
    ).run(id, storeId, today, actor.id, nowIso());
    writeAudit({ entityType: "shift", entityId: id, actor, action: "CREATED", newValue: { pic: actor.id } });
    shift = db
      .prepare(`SELECT s.*, u.name as pic_name FROM shifts s LEFT JOIN users u ON u.id = s.pic_user_id WHERE s.id = ?`)
      .get(id) as ShiftRow;
  }
  return shift;
}

export function assignPIC(shiftId: string, newPicId: string, actor: SessionUser) {
  const db = getDb();
  const shift = db.prepare(`SELECT pic_user_id FROM shifts WHERE id = ?`).get(shiftId) as { pic_user_id: string | null };
  db.prepare(`UPDATE shifts SET pic_user_id = ? WHERE id = ?`).run(newPicId, shiftId);
  writeAudit({
    entityType: "shift",
    entityId: shiftId,
    actor,
    action: "ASSIGNED",
    oldValue: { pic_user_id: shift?.pic_user_id },
    newValue: { pic_user_id: newPicId },
  });
}

export function getLastAcknowledgedShiftForUser(storeId: string, userId: string): ShiftRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.* FROM shifts s
       JOIN handoffs h ON h.incoming_shift_id = s.id
       WHERE s.store_id = ? AND h.incoming_pic_id = ? AND h.incoming_acknowledged_at IS NOT NULL
       ORDER BY h.incoming_acknowledged_at DESC LIMIT 1`
    )
    .get(storeId, userId) as ShiftRow | undefined;
}
