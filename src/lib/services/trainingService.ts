import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { storeLocalIso } from "../storeTime";
import { SessionUser } from "../types";

export type TrainingPosition = "COUNTERHELP" | "COOK" | "KITCHENHELP" | "SHIFT_LEAD";

export interface TrainingItem {
  id: string;
  position: TrainingPosition;
  title: string;
  title_es: string | null;
  sort_order: number;
}

export interface TraineeRow {
  id: string;
  name: string;
  position: TrainingPosition;
  status: "IN_PROGRESS" | "COMPLETE";
  started_at: string;
  completed_count: number;
  total_count: number;
}

export function getTrainingItems(storeId: string, position?: TrainingPosition): TrainingItem[] {
  const db = getDb();
  if (position) {
    return db
      .prepare(`SELECT id, position, title, title_es, sort_order FROM training_items WHERE store_id = ? AND position = ? AND active = 1 ORDER BY sort_order, title`)
      .all(storeId, position) as TrainingItem[];
  }
  return db
    .prepare(`SELECT id, position, title, title_es, sort_order FROM training_items WHERE store_id = ? AND active = 1 ORDER BY position, sort_order, title`)
    .all(storeId) as TrainingItem[];
}

export function addTrainingItem(storeId: string, position: TrainingPosition, title: string, titleEs: string | null, actor: SessionUser): string {
  const db = getDb();
  const id = newId();
  const maxOrder = db.prepare(`SELECT MAX(sort_order) as m FROM training_items WHERE store_id = ? AND position = ?`).get(storeId, position) as { m: number | null };
  db.prepare(
    `INSERT INTO training_items (id, store_id, position, title, title_es, sort_order, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, storeId, position, title, titleEs, (maxOrder.m ?? -1) + 1, actor.id, nowIso());
  writeAudit({ entityType: "training_item", entityId: id, actor, action: "CREATED", newValue: { position, title } });
  return id;
}

export function removeTrainingItem(id: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE training_items SET active = 0 WHERE id = ?`).run(id);
  writeAudit({ entityType: "training_item", entityId: id, actor, action: "CANCELLED" });
}

/** Trainees with a live completed/total count against the current active
 * checklist for their position -- items added after a trainee started still
 * count against them, since the checklist reflects what "trained" means now. */
export function getTrainees(storeId: string): TraineeRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT tr.id, tr.name, tr.position, tr.status, tr.started_at,
        (SELECT COUNT(*) FROM training_completions tc
          JOIN training_items ti ON ti.id = tc.training_item_id
          WHERE tc.trainee_id = tr.id AND ti.active = 1) as completed_count,
        (SELECT COUNT(*) FROM training_items ti2 WHERE ti2.store_id = tr.store_id AND ti2.position = tr.position AND ti2.active = 1) as total_count
       FROM trainees tr WHERE tr.store_id = ? ORDER BY tr.status ASC, tr.started_at DESC`
    )
    .all(storeId) as TraineeRow[];
}

export function createTrainee(storeId: string, name: string, position: TrainingPosition, actor: SessionUser): string {
  const db = getDb();
  const id = newId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO trainees (id, store_id, name, position, status, started_at, created_by, created_at) VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)`
  ).run(id, storeId, name, position, ts, actor.id, ts);
  writeAudit({ entityType: "trainee", entityId: id, actor, action: "CREATED", newValue: { name, position } });
  return id;
}

export interface TraineeDetail {
  id: string;
  name: string;
  position: TrainingPosition;
  status: "IN_PROGRESS" | "COMPLETE";
  started_at: string;
  store_id: string;
}

export function getTraineeDetail(traineeId: string, storeId: string): TraineeDetail | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM trainees WHERE id = ? AND store_id = ?`).get(traineeId, storeId) as TraineeDetail | undefined;
}

export interface TrainingChecklistRow extends TrainingItem {
  trained_by: string | null;
  trained_by_name: string | null;
  trained_at: string | null;
  shift_type: TrainingShiftType | null;
  notes: string | null;
}

export function getTraineeChecklist(trainee: TraineeDetail): TrainingChecklistRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ti.id, ti.position, ti.title, ti.title_es, ti.sort_order, tc.trained_by, u.name as trained_by_name, tc.trained_at, tc.shift_type, tc.notes
       FROM training_items ti
       LEFT JOIN training_completions tc ON tc.training_item_id = ti.id AND tc.trainee_id = ?
       LEFT JOIN users u ON u.id = tc.trained_by
       WHERE ti.store_id = ? AND ti.position = ? AND ti.active = 1
       ORDER BY ti.sort_order, ti.title`
    )
    .all(trainee.id, trainee.store_id, trainee.position) as TrainingChecklistRow[];
}

/** Toggles one checklist item for this trainee. Any manager can do this --
 * training happens across whoever's on shift, not one owner -- and the
 * audit trail (trained_by/trained_at) is what lets the next manager see who
 * covered what and when. Marking the trainee COMPLETE is a separate,
 * explicit action rather than automatic, so a manager decides when training
 * is actually done rather than the last checkbox silently closing it out. */
export function toggleTrainingItem(traineeId: string, trainingItemId: string, actor: SessionUser): boolean {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM training_completions WHERE trainee_id = ? AND training_item_id = ?`)
    .get(traineeId, trainingItemId) as { id: string } | undefined;
  if (existing) {
    db.prepare(`DELETE FROM training_completions WHERE id = ?`).run(existing.id);
    writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { training_item_id: trainingItemId, trained: false } });
    return false;
  }
  db.prepare(
    `INSERT INTO training_completions (id, trainee_id, training_item_id, trained_by, trained_at) VALUES (?, ?, ?, ?, ?)`
  ).run(newId(), traineeId, trainingItemId, actor.id, nowIso());
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { training_item_id: trainingItemId, trained: true } });
  return true;
}

/** Everything about a trained checklist item can be corrected afterward --
 * the trained checkbox just stamps "now" at the moment it's tapped, but a
 * manager is often logging training that actually happened earlier (a
 * different day, a different shift), or wants to flag "needs
 * follow-up/retraining" without un-checking it (which would misrepresent
 * that the training never happened at all). Only meaningful once the item
 * has actually been marked trained, since that's the completion row these
 * fields attach to. `trainedAtDate` is a plain "YYYY-MM-DD" store-local
 * date -- converted to a real UTC instant (at noon store-local, so it can
 * never drift onto the adjacent calendar day) rather than stored as a bare
 * date string, consistent with every other date field in the app.
 * `trainedBy` is who actually DID the training -- distinct from `actor`
 * (whoever is making this edit), since a manager filling in the record
 * afterward is very often not the one who trained the associate. */
export function updateTrainingCompletion(
  storeId: string,
  traineeId: string,
  trainingItemId: string,
  fields: { trainedAtDate?: string; shiftType?: TrainingShiftType | null; trainedBy?: string | null; notes?: string | null },
  actor: SessionUser
) {
  const db = getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (fields.trainedAtDate !== undefined) {
    sets.push("trained_at = ?");
    args.push(storeLocalIso(storeId, fields.trainedAtDate, "12:00"));
  }
  if (fields.shiftType !== undefined) {
    sets.push("shift_type = ?");
    args.push(fields.shiftType);
  }
  if (fields.trainedBy !== undefined) {
    sets.push("trained_by = ?");
    args.push(fields.trainedBy);
  }
  if (fields.notes !== undefined) {
    sets.push("notes = ?");
    args.push(fields.notes);
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE training_completions SET ${sets.join(", ")} WHERE trainee_id = ? AND training_item_id = ?`).run(...args, traineeId, trainingItemId);
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { training_item_id: trainingItemId, ...fields } });
}

/** One-tap "did this again, just now" -- re-stamps trained_by/trained_at to
 * the current actor and moment, distinct from the full edit form (which is
 * for correcting a record to reflect training that already happened, not
 * for logging a fresh retrain). Leaves shift_type/notes alone; a manager can
 * still adjust those separately if the retrain also warrants a new note. */
export function retrainCompletion(traineeId: string, trainingItemId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE training_completions SET trained_by = ?, trained_at = ? WHERE trainee_id = ? AND training_item_id = ?`).run(
    actor.id,
    nowIso(),
    traineeId,
    trainingItemId
  );
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { training_item_id: trainingItemId, retrained: true } });
}

export function markTraineeComplete(traineeId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`UPDATE trainees SET status = 'COMPLETE' WHERE id = ?`).run(traineeId);
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "COMPLETED" });
}

export type TrainingShiftType = "MORNING" | "EVENING" | "DOUBLE";

export interface TrainingSessionRow {
  id: string;
  date: string;
  shift_type: TrainingShiftType;
  manager_id: string | null;
  manager_name: string | null;
  notes: string | null;
}

/** Planned training sessions for this trainee, soonest first -- lets a
 * manager schedule ahead (day, shift, who's working with the trainee)
 * instead of training only happening whenever someone's free. */
export function getTrainingSessions(traineeId: string): TrainingSessionRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ts.id, ts.date, ts.shift_type, ts.manager_id, u.name as manager_name, ts.notes
       FROM training_sessions ts LEFT JOIN users u ON u.id = ts.manager_id
       WHERE ts.trainee_id = ? ORDER BY ts.date ASC`
    )
    .all(traineeId) as TrainingSessionRow[];
}

export function scheduleTrainingSession(
  traineeId: string,
  date: string,
  shiftType: TrainingShiftType,
  managerId: string | null,
  actor: SessionUser,
  notes: string | null = null
): string {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO training_sessions (id, trainee_id, date, shift_type, manager_id, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, traineeId, date, shiftType, managerId, notes, actor.id, nowIso());
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { scheduled_session: { date, shiftType, managerId, notes } } });
  return id;
}

/** Every field a session was created with can be revised afterward -- the
 * date/shift/manager originally picked is often provisional (swapped once
 * the actual schedule firms up), and notes are frequently only known once
 * the session's already on the calendar. */
export function updateTrainingSession(
  id: string,
  traineeId: string,
  date: string,
  shiftType: TrainingShiftType,
  managerId: string | null,
  notes: string | null,
  actor: SessionUser
) {
  const db = getDb();
  db.prepare(`UPDATE training_sessions SET date = ?, shift_type = ?, manager_id = ?, notes = ? WHERE id = ?`).run(date, shiftType, managerId, notes, id);
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { updated_session: { id, date, shiftType, managerId, notes } } });
}

export function removeTrainingSession(id: string, traineeId: string, actor: SessionUser) {
  const db = getDb();
  db.prepare(`DELETE FROM training_sessions WHERE id = ?`).run(id);
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { removed_session: id } });
}
