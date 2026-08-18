import "server-only";
import { getDb } from "../db";

export interface SearchResult {
  kind: string;
  id: string;
  title: string;
  status: string;
  date: string;
}

export interface SearchFilters {
  kind?: string; // task | issue | guest_recovery | borrowed_item | cleaning
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function searchAll(storeId: string, query: string, filters: SearchFilters = {}): SearchResult[] {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;
  const results: SearchResult[] = [];
  const dateFrom = filters.startDate || "0000-01-01";
  const dateTo = filters.endDate ? `${filters.endDate}T23:59:59` : "9999-12-31T23:59:59";
  const wantKind = (k: string) => !filters.kind || filters.kind === k;
  const matchesStatus = (s: string) => !filters.status || filters.status === s;

  if (wantKind("task")) {
    const tasks = db
      .prepare(
        `SELECT id, title, status, created_at FROM tasks WHERE store_id = ? AND lower(title) LIKE ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(storeId, q, dateFrom, dateTo) as Array<{ id: string; title: string; status: string; created_at: string }>;
    results.push(...tasks.filter((t) => matchesStatus(t.status)).map((t) => ({ kind: "task", id: t.id, title: t.title, status: t.status, date: t.created_at })));
  }

  if (wantKind("issue")) {
    const issues = db
      .prepare(
        `SELECT id, description, status, created_at FROM issues WHERE store_id = ? AND lower(description) LIKE ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(storeId, q, dateFrom, dateTo) as Array<{ id: string; description: string; status: string; created_at: string }>;
    results.push(...issues.filter((i) => matchesStatus(i.status)).map((i) => ({ kind: "issue", id: i.id, title: i.description, status: i.status, date: i.created_at })));
  }

  if (wantKind("guest_recovery")) {
    const gr = db
      .prepare(
        `SELECT id, issue_category, replacement_status, guest_name, item_description, created_at FROM guest_recoveries
         WHERE store_id = ? AND (lower(issue_category) LIKE ? OR lower(guest_name) LIKE ? OR lower(item_description) LIKE ?)
         AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(storeId, q, q, q, dateFrom, dateTo) as Array<{
      id: string;
      issue_category: string;
      replacement_status: string;
      guest_name: string | null;
      item_description: string | null;
      created_at: string;
    }>;
    results.push(
      ...gr
        .filter((g) => matchesStatus(g.replacement_status))
        .map((g) => ({
          kind: "guest_recovery",
          id: g.id,
          title: `Meal Replacement: ${g.guest_name ? `${g.guest_name} · ` : ""}${g.item_description || g.issue_category}`,
          status: g.replacement_status,
          date: g.created_at,
        }))
    );
  }

  if (wantKind("borrowed_item")) {
    const borrowed = db
      .prepare(
        `SELECT id, item, direction, status, created_at FROM borrowed_items WHERE store_id = ? AND lower(item) LIKE ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(storeId, q, dateFrom, dateTo) as Array<{ id: string; item: string; direction: "BORROWED" | "LENT"; status: string; created_at: string }>;
    results.push(
      ...borrowed
        .filter((b) => matchesStatus(b.status))
        .map((b) => ({ kind: "borrowed_item", id: b.id, title: `${b.direction === "LENT" ? "Lent" : "Borrowed"}: ${b.item}`, status: b.status, date: b.created_at }))
    );
  }

  if (wantKind("cleaning")) {
    const cleaning = db
      .prepare(
        `SELECT ct.id, ct.title, ct.status, ct.created_at FROM cleaning_tasks ct JOIN cleaning_areas a ON a.id = ct.area_id
         WHERE a.store_id = ? AND lower(ct.title) LIKE ? AND ct.created_at BETWEEN ? AND ? ORDER BY ct.created_at DESC LIMIT 50`
      )
      .all(storeId, q, dateFrom, dateTo) as Array<{ id: string; title: string; status: string; created_at: string }>;
    results.push(...cleaning.filter((c) => matchesStatus(c.status)).map((c) => ({ kind: "cleaning", id: c.id, title: c.title, status: c.status, date: c.created_at })));
  }

  if (wantKind("trainee")) {
    const trainees = db
      .prepare(`SELECT id, name, status, started_at FROM trainees WHERE store_id = ? AND lower(name) LIKE ? AND started_at BETWEEN ? AND ? ORDER BY started_at DESC LIMIT 50`)
      .all(storeId, q, dateFrom, dateTo) as Array<{ id: string; name: string; status: string; started_at: string }>;
    results.push(...trainees.filter((tr) => matchesStatus(tr.status)).map((tr) => ({ kind: "trainee", id: tr.id, title: tr.name, status: tr.status, date: tr.started_at })));
  }

  return results.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Reconstruct a single historical shift: PIC, that day's tasks, guest
 * recoveries/issues/borrowed items opened that day, the shift's handoff, and
 * cleaning activity that day (read from the append-only audit log, since
 * cleaning_tasks are ongoing per-area records with no daily snapshot --
 * audit_events is the durable per-day record of what actually happened).
 */
export function getShiftHistory(storeId: string, shiftId: string) {
  const db = getDb();
  const shift = db
    .prepare(`SELECT s.*, u.name as pic_name FROM shifts s LEFT JOIN users u ON u.id = s.pic_user_id WHERE s.id = ? AND s.store_id = ?`)
    .get(shiftId, storeId) as { id: string; date: string; status: string; pic_name: string | null } | undefined;
  if (!shift) return undefined;

  const dayStart = shift.date;
  const dayEnd = `${shift.date}T23:59:59`;

  const tasks = db
    .prepare(`SELECT title, status FROM tasks WHERE store_id = ? AND scheduled_date = ? ORDER BY due_at IS NULL, due_at`)
    .all(storeId, dayStart) as Array<{ title: string; status: string }>;
  const guestRecoveries = db
    .prepare(`SELECT issue_category, replacement_status, created_at FROM guest_recoveries WHERE store_id = ? AND created_at BETWEEN ? AND ?`)
    .all(storeId, dayStart, dayEnd) as Array<{ issue_category: string; replacement_status: string; created_at: string }>;
  const issues = db
    .prepare(`SELECT category, description, status, created_at FROM issues WHERE store_id = ? AND created_at BETWEEN ? AND ?`)
    .all(storeId, dayStart, dayEnd) as Array<{ category: string; description: string; status: string; created_at: string }>;
  const borrowedItems = db
    .prepare(`SELECT item, borrowed_from, direction, status, created_at FROM borrowed_items WHERE store_id = ? AND created_at BETWEEN ? AND ?`)
    .all(storeId, dayStart, dayEnd) as Array<{ item: string; borrowed_from: string; direction: "BORROWED" | "LENT"; status: string; created_at: string }>;
  const cleaningActivity = db
    .prepare(
      `SELECT ae.action, ae.created_at, ct.title, u.name as actor_name
       FROM audit_events ae
       JOIN cleaning_tasks ct ON ct.id = ae.entity_id
       JOIN cleaning_areas a ON a.id = ct.area_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'cleaning_task' AND a.store_id = ? AND ae.created_at BETWEEN ? AND ?
       ORDER BY ae.created_at`
    )
    .all(storeId, dayStart, dayEnd) as Array<{ action: string; created_at: string; title: string; actor_name: string | null }>;
  const handoff = db
    .prepare(`SELECT h.*, u1.name as outgoing_pic_name, u2.name as incoming_pic_name
       FROM handoffs h
       LEFT JOIN users u1 ON u1.id = h.outgoing_pic_id
       LEFT JOIN users u2 ON u2.id = h.incoming_pic_id
       WHERE h.outgoing_shift_id = ?`)
    .get(shiftId) as { status: string; outgoing_pic_name: string | null; incoming_pic_name: string | null } | undefined;

  return { shift, tasks, guestRecoveries, issues, borrowedItems, cleaningActivity, handoff };
}

export function getHistoryForRange(storeId: string, start: string, end: string) {
  const db = getDb();
  return {
    tasks: db.prepare(`SELECT * FROM tasks WHERE store_id = ? AND scheduled_date BETWEEN ? AND ? ORDER BY scheduled_date`).all(storeId, start, end),
    shifts: db.prepare(`SELECT s.*, u.name as pic_name FROM shifts s LEFT JOIN users u ON u.id = s.pic_user_id WHERE s.store_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.date`).all(storeId, start, end),
    guestRecoveries: db.prepare(`SELECT * FROM guest_recoveries WHERE store_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at`).all(storeId, start, `${end}T23:59:59`),
    issues: db.prepare(`SELECT * FROM issues WHERE store_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at`).all(storeId, start, `${end}T23:59:59`),
    borrowedItems: db.prepare(`SELECT * FROM borrowed_items WHERE store_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at`).all(storeId, start, `${end}T23:59:59`),
    handoffs: db.prepare(`SELECT * FROM handoffs WHERE store_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at`).all(storeId, start, `${end}T23:59:59`),
  };
}
