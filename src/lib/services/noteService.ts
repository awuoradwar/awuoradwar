import "server-only";
import { getDb } from "../db";
import { writeAudit } from "../audit";
import { SessionUser } from "../types";
import { storeDayRangeUtc } from "../storeTime";

export interface ShiftNote {
  id: string;
  text: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

/** Today's shift notes, most recent first -- the Quick Log "Note" form's
 * whole point is a manager sharing something with whoever else is on
 * (a meeting reminder, a heads-up), so this is scoped to what a manager
 * checking the app today would actually want to see, not a full unbounded
 * history. Older notes stay in the table (never deleted except by an admin
 * data reset) but simply age out of this view. */
export function getTodayNotes(storeId: string, todayStr: string): ShiftNote[] {
  const db = getDb();
  const { start, end } = storeDayRangeUtc(storeId, todayStr);
  return db
    .prepare(
      `SELECT n.id, n.text, n.author_id, u.name as author_name, n.created_at
       FROM shift_notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.store_id = ? AND n.created_at >= ? AND n.created_at < ?
       ORDER BY n.created_at DESC`
    )
    .all(storeId, start, end) as ShiftNote[];
}

export function deleteShiftNote(id: string, storeId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`DELETE FROM shift_notes WHERE id = ? AND store_id = ?`).run(id, storeId);
  writeAudit({ entityType: "shift_note", entityId: id, actor, action: "CANCELLED" });
}
