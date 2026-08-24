import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { storeLocalIso } from "../storeTime";
import { SessionUser } from "../types";

export type TrainingPosition = "COUNTERHELP" | "COOK" | "KITCHENHELP" | "SHIFT_LEAD";

export type TrainingItemPhase = "OPENING" | "SHIFT" | "CLOSING";

export interface TrainingItem {
  id: string;
  position: TrainingPosition;
  title: string;
  title_es: string | null;
  phase: TrainingItemPhase;
  sort_order: number;
}

const PHASE_ORDER_SQL = `CASE ti.phase WHEN 'OPENING' THEN 0 WHEN 'SHIFT' THEN 1 WHEN 'CLOSING' THEN 2 ELSE 3 END`;

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
      .prepare(
        `SELECT ti.id, ti.position, ti.title, ti.title_es, ti.phase, ti.sort_order FROM training_items ti
         WHERE ti.store_id = ? AND ti.position = ? AND ti.active = 1 ORDER BY ${PHASE_ORDER_SQL}, ti.sort_order, ti.title`
      )
      .all(storeId, position) as TrainingItem[];
  }
  return db
    .prepare(
      `SELECT ti.id, ti.position, ti.title, ti.title_es, ti.phase, ti.sort_order FROM training_items ti
       WHERE ti.store_id = ? AND ti.active = 1 ORDER BY ti.position, ${PHASE_ORDER_SQL}, ti.sort_order, ti.title`
    )
    .all(storeId) as TrainingItem[];
}

export function addTrainingItem(
  storeId: string,
  position: TrainingPosition,
  title: string,
  titleEs: string | null,
  phase: TrainingItemPhase,
  actor: SessionUser
): string {
  const db = getDb();
  const id = newId();
  // New items go to the end of their own phase group, not the position's
  // overall max -- otherwise a step added to Opening would land after every
  // Closing step instead of with the rest of Opening.
  const maxOrder = db
    .prepare(`SELECT MAX(sort_order) as m FROM training_items WHERE store_id = ? AND position = ? AND phase = ?`)
    .get(storeId, position, phase) as { m: number | null };
  db.prepare(
    `INSERT INTO training_items (id, store_id, position, title, title_es, phase, sort_order, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, storeId, position, title, titleEs, phase, (maxOrder.m ?? -1) + 1, actor.id, nowIso());
  writeAudit({ entityType: "training_item", entityId: id, actor, action: "CREATED", newValue: { position, title, phase } });
  return id;
}

/** Rename/re-categorize an existing step -- moving it to a different phase
 * sends it to the end of that phase's own order, same as a brand new item,
 * since its old position's sort_order has no meaning in a different group. */
export function updateTrainingItem(id: string, title: string, titleEs: string | null, phase: TrainingItemPhase, actor: SessionUser) {
  const db = getDb();
  const existing = db.prepare(`SELECT store_id, position, phase, sort_order FROM training_items WHERE id = ?`).get(id) as
    | { store_id: string; position: TrainingPosition; phase: TrainingItemPhase; sort_order: number }
    | undefined;
  if (!existing) return;
  let sortOrder = existing.sort_order;
  if (existing.phase !== phase) {
    const maxOrder = db
      .prepare(`SELECT MAX(sort_order) as m FROM training_items WHERE store_id = ? AND position = ? AND phase = ?`)
      .get(existing.store_id, existing.position, phase) as { m: number | null };
    sortOrder = (maxOrder.m ?? -1) + 1;
  }
  db.prepare(`UPDATE training_items SET title = ?, title_es = ?, phase = ?, sort_order = ? WHERE id = ?`).run(title, titleEs, phase, sortOrder, id);
  writeAudit({ entityType: "training_item", entityId: id, actor, action: "EDITED", newValue: { title, phase } });
}

/** Persists a drag-and-drop reorder in one round trip -- orderedIds is the
 * full new order for one position+phase group (reordering never crosses
 * phase groups, since dragging something out of Closing into the end of
 * Shift wouldn't have an obvious meaning; changing phase is its own
 * explicit edit instead). Re-numbering everyone 0..n instead of touching
 * only what changed is simpler and just as cheap for a checklist-sized
 * group. */
export function reorderTrainingItems(orderedIds: string[], actor: SessionUser) {
  const db = getDb();
  const update = db.prepare(`UPDATE training_items SET sort_order = ? WHERE id = ?`);
  const run = db.transaction((ids: string[]) => {
    ids.forEach((id, i) => update.run(i, id));
  });
  run(orderedIds);
  writeAudit({ entityType: "training_item", entityId: orderedIds[0], actor, action: "EDITED", newValue: { reordered: orderedIds } });
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
  log: TrainingCompletionLogEntry[];
}

export interface TrainingCompletionLogEntry {
  id: string;
  trained_at: string;
  shift_type: TrainingShiftType | null;
  trained_by: string | null;
  trained_by_name: string | null;
  notes: string | null;
  /** When this specific entry was actually saved -- distinct from
   * trained_at, which is manager-editable and only date/shift grained (two
   * retrains logged for the same date/shift/trainer share an identical
   * trained_at). This is the one field that's always unique per event, so
   * the UI can use it to prove two same-looking entries are genuinely two
   * different saves rather than one duplicated. */
  created_at: string;
}

/** Every completion/retrain event ever logged for one specific checklist
 * item -- not the same as the audit trail (which is immutable and mixes
 * every item on the trainee together), this is a real per-item history a
 * manager can look back through, with a note on each entry they can still
 * correct afterward. */
export function getTrainingCompletionLog(traineeId: string, trainingItemId: string): TrainingCompletionLogEntry[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT l.id, l.trained_at, l.shift_type, l.trained_by, u.name as trained_by_name, l.notes, l.created_at
       FROM training_completion_log l LEFT JOIN users u ON u.id = l.trained_by
       WHERE l.trainee_id = ? AND l.training_item_id = ? ORDER BY l.trained_at DESC, l.created_at DESC`
    )
    .all(traineeId, trainingItemId) as TrainingCompletionLogEntry[];
}

function logCompletion(traineeId: string, trainingItemId: string, trainedAt: string, shiftType: TrainingShiftType | null, trainedBy: string, notes: string | null) {
  const db = getDb();
  db.prepare(
    `INSERT INTO training_completion_log (id, trainee_id, training_item_id, trained_at, shift_type, trained_by, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), traineeId, trainingItemId, trainedAt, shiftType, trainedBy, notes, nowIso());
}

/** Correct a specific past log entry after the fact -- distinct from every
 * other edit path here, which all only ever touch the *current* completion
 * state; this is the one place a manager can fix what an old entry actually
 * says (wrong trainer picked in the moment, wrong date, wrong shift, a typo
 * in the note) without it looking like the retrain happened again. */
export function updateTrainingCompletionLogEntry(
  storeId: string,
  traineeId: string,
  logId: string,
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
  db.prepare(`UPDATE training_completion_log SET ${sets.join(", ")} WHERE id = ? AND trainee_id = ?`).run(...args, logId, traineeId);
  writeAudit({ entityType: "trainee", entityId: traineeId, actor, action: "EDITED", newValue: { training_completion_log_id: logId, ...fields } });
}

export interface TrainingHistoryEntry {
  id: string;
  trainee_id: string;
  trainee_name: string;
  position: TrainingPosition;
  training_item_id: string;
  item_title: string;
  item_title_es: string | null;
  trained_at: string;
  shift_type: TrainingShiftType | null;
  trained_by_name: string | null;
  notes: string | null;
  isRetrain: boolean;
  daysSincePrevious: number | null;
}

/** Every completion/retrain event across the whole store, in one place --
 * distinct from getTrainingCompletionLog (one trainee, one item). The first
 * time any given trainee+item pair appears is the original training; every
 * later one is flagged as a retrain, with the gap since the previous event
 * for that same pair -- this is what actually answers "is this step hard
 * for new associates" (how often it gets retrained) and "how long did it
 * take" (the gap itself), neither of which a single current-state row could
 * ever show. */
export function getTrainingHistory(storeId: string): TrainingHistoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.id, l.trainee_id, tr.name as trainee_name, tr.position,
              l.training_item_id, ti.title as item_title, ti.title_es as item_title_es,
              l.trained_at, l.shift_type, u.name as trained_by_name, l.notes
       FROM training_completion_log l
       JOIN trainees tr ON tr.id = l.trainee_id
       JOIN training_items ti ON ti.id = l.training_item_id
       LEFT JOIN users u ON u.id = l.trained_by
       WHERE tr.store_id = ?
       ORDER BY l.trained_at ASC`
    )
    .all(storeId) as Array<Omit<TrainingHistoryEntry, "isRetrain" | "daysSincePrevious">>;

  const lastSeenAt = new Map<string, string>(); // "traineeId|itemId" -> previous trained_at
  const withFlags = rows.map((r) => {
    const key = `${r.trainee_id}|${r.training_item_id}`;
    const previous = lastSeenAt.get(key);
    lastSeenAt.set(key, r.trained_at);
    const daysSincePrevious = previous ? Math.round((new Date(r.trained_at).getTime() - new Date(previous).getTime()) / 86400000) : null;
    return { ...r, isRetrain: previous !== undefined, daysSincePrevious };
  });

  return withFlags.sort((a, b) => (a.trained_at < b.trained_at ? 1 : -1));
}

export interface RetrainFrequencyRow {
  position: TrainingPosition;
  item_title: string;
  item_title_es: string | null;
  retrainCount: number;
  traineeCount: number;
}

/** Which steps get retrained the most, across every trainee who's ever
 * touched them -- the direct answer to "is this area a hard thing for new
 * associates," ranked so the hardest steps surface first. */
export function getTrainingRetrainFrequency(storeId: string): RetrainFrequencyRow[] {
  const history = getTrainingHistory(storeId);
  const byItem = new Map<string, RetrainFrequencyRow & { traineeIds: Set<string> }>();
  for (const h of history) {
    if (!h.isRetrain) continue;
    const key = `${h.position}|${h.item_title}`;
    if (!byItem.has(key)) {
      byItem.set(key, { position: h.position, item_title: h.item_title, item_title_es: h.item_title_es, retrainCount: 0, traineeCount: 0, traineeIds: new Set() });
    }
    const entry = byItem.get(key)!;
    entry.retrainCount++;
    entry.traineeIds.add(h.trainee_id);
  }
  return [...byItem.values()]
    .map(({ traineeIds, ...rest }) => ({ ...rest, traineeCount: traineeIds.size }))
    .sort((a, b) => b.retrainCount - a.retrainCount);
}

export function getTraineeChecklist(trainee: TraineeDetail): TrainingChecklistRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ti.id, ti.position, ti.title, ti.title_es, ti.phase, ti.sort_order, tc.trained_by, u.name as trained_by_name, tc.trained_at, tc.shift_type, tc.notes
       FROM training_items ti
       LEFT JOIN training_completions tc ON tc.training_item_id = ti.id AND tc.trainee_id = ?
       LEFT JOIN users u ON u.id = tc.trained_by
       WHERE ti.store_id = ? AND ti.position = ? AND ti.active = 1
       ORDER BY ${PHASE_ORDER_SQL}, ti.sort_order, ti.title`
    )
    .all(trainee.id, trainee.store_id, trainee.position) as Array<Omit<TrainingChecklistRow, "log">>;

  const logRows = db
    .prepare(
      `SELECT l.id, l.training_item_id, l.trained_at, l.shift_type, l.trained_by, u.name as trained_by_name, l.notes, l.created_at
       FROM training_completion_log l LEFT JOIN users u ON u.id = l.trained_by
       WHERE l.trainee_id = ? ORDER BY l.trained_at DESC, l.created_at DESC`
    )
    .all(trainee.id) as Array<TrainingCompletionLogEntry & { training_item_id: string }>;
  const logByItem = new Map<string, TrainingCompletionLogEntry[]>();
  for (const l of logRows) {
    if (!logByItem.has(l.training_item_id)) logByItem.set(l.training_item_id, []);
    logByItem.get(l.training_item_id)!.push(l);
  }

  return rows.map((r) => ({ ...r, log: logByItem.get(r.id) || [] }));
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
  const trainedAt = nowIso();
  db.prepare(
    `INSERT INTO training_completions (id, trainee_id, training_item_id, trained_by, trained_at) VALUES (?, ?, ?, ?, ?)`
  ).run(newId(), traineeId, trainingItemId, actor.id, trainedAt);
  logCompletion(traineeId, trainingItemId, trainedAt, null, actor.id, null);
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

/** "This happened again" -- re-stamps trained_by/trained_at (and shift) to
 * reflect when the retrain actually happened, distinct from the full edit
 * form (which is for correcting a record to reflect training that already
 * happened at some point in the past, not specifically logging a fresh
 * retrain). Takes an explicit date/shift rather than always stamping the
 * exact moment tapped -- a manager is very often logging a retrain from
 * earlier in the day, or even a prior shift, after the fact. Also appends
 * its own entry to training_completion_log (with this retrain's own note),
 * so this specific event -- not just the item's current state -- stays
 * visible afterward. */
export function retrainCompletion(
  storeId: string,
  traineeId: string,
  trainingItemId: string,
  trainedAtDate: string,
  shiftType: TrainingShiftType,
  trainedBy: string | null,
  notes: string | null,
  actor: SessionUser
) {
  const db = getDb();
  const trainedAt = storeLocalIso(storeId, trainedAtDate, "12:00");
  // Who actually did the retrain is very often not whoever's logging it
  // (same distinction updateTrainingCompletion draws) -- falls back to the
  // person logging it only when no one else is picked.
  const trainer = trainedBy || actor.id;
  // A blank note on the retrain form doesn't mean "clear the existing note"
  // -- only overwrite the current-state note when this retrain actually
  // provided a new one, same reasoning as updateTrainingCompletion's
  // undefined-vs-provided handling elsewhere in this file.
  const setNotes = notes ? ", notes = ?" : "";
  db.prepare(
    `UPDATE training_completions SET trained_by = ?, trained_at = ?, shift_type = ?${setNotes} WHERE trainee_id = ? AND training_item_id = ?`
  ).run(...[trainer, trainedAt, shiftType, ...(notes ? [notes] : []), traineeId, trainingItemId]);
  logCompletion(traineeId, trainingItemId, trainedAt, shiftType, trainer, notes);
  writeAudit({
    entityType: "trainee",
    entityId: traineeId,
    actor,
    action: "EDITED",
    newValue: { training_item_id: trainingItemId, retrained: true, trained_at_date: trainedAtDate, shift_type: shiftType, trained_by: trainer, notes },
  });
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
