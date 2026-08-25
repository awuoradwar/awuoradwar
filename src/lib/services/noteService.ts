import "server-only";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../db";
import { writeAudit } from "../audit";
import { SessionUser } from "../types";
import { storeDayRangeUtc } from "../storeTime";

const ATTACHMENT_DIR = path.join(process.cwd(), "data", "private-uploads", "shift-notes");

export interface NoteSection {
  topic: string;
  topicEs: string;
  subtopic: string;
  subtopicEs: string;
  bullets: string[];
  bulletsEs: string[];
}

export interface NoteAttachment {
  id: string;
  file_ref: string;
  original_name: string | null;
  content_type: string | null;
}

interface ShiftNoteRawRow {
  id: string;
  text: string;
  title: string | null;
  title_es: string | null;
  sections_json: string | null;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

export interface ShiftNote {
  id: string;
  text: string;
  title: string | null;
  title_es: string | null;
  sections: NoteSection[];
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

export interface ShiftNoteWithAttachments extends ShiftNote {
  attachments: NoteAttachment[];
}

function parseSections(json: string | null): NoteSection[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toShiftNote(row: ShiftNoteRawRow): ShiftNote {
  return { ...row, sections: parseSections(row.sections_json) };
}

const SELECT = `SELECT n.id, n.text, n.title, n.title_es, n.sections_json, n.author_id, u.name as author_name, n.created_at
   FROM shift_notes n LEFT JOIN users u ON u.id = n.author_id`;

/** Today's shift notes, most recent first -- the Quick Log "Note" form's
 * whole point is a manager sharing something with whoever else is on
 * (a meeting reminder, a heads-up), so this is scoped to what a manager
 * checking the app today would actually want to see, not a full unbounded
 * history (that lives at More > Notes instead). Older notes stay in the
 * table (never deleted except by an admin data reset) but simply age out
 * of this view. */
export function getTodayNotes(storeId: string, todayStr: string): ShiftNote[] {
  const db = getDb();
  const { start, end } = storeDayRangeUtc(storeId, todayStr);
  const rows = db
    .prepare(`${SELECT} WHERE n.store_id = ? AND n.created_at >= ? AND n.created_at < ? ORDER BY n.created_at DESC`)
    .all(storeId, start, end) as ShiftNoteRawRow[];
  return rows.map(toShiftNote);
}

/** Full history for the More > Notes list -- unbounded, same shape as every
 * other History section (Waste Log, Work Orders, ...) grouped by week via
 * HistoryByWeek on the page itself. */
export function getNotesHistory(storeId: string): ShiftNote[] {
  const db = getDb();
  const rows = db.prepare(`${SELECT} WHERE n.store_id = ? ORDER BY n.created_at DESC`).all(storeId) as ShiftNoteRawRow[];
  return rows.map(toShiftNote);
}

export function getNoteDetail(id: string, storeId: string): ShiftNoteWithAttachments | null {
  const db = getDb();
  const row = db.prepare(`${SELECT} WHERE n.id = ? AND n.store_id = ?`).get(id, storeId) as ShiftNoteRawRow | undefined;
  if (!row) return null;
  const attachments = db
    .prepare(`SELECT id, file_ref, original_name, content_type FROM note_attachments WHERE note_id = ? ORDER BY created_at`)
    .all(id) as NoteAttachment[];
  return { ...toShiftNote(row), attachments };
}

/** Resolves an attachment id to its on-disk filename, scoped to the
 * requesting user's store via a join through the parent note -- the same
 * store-scoping every other private-upload route (attendance, cleaning,
 * store P&L) enforces before ever touching the filesystem. */
export function getNoteAttachmentRef(attachmentId: string, storeId: string): { file_ref: string; content_type: string | null } | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.file_ref, a.content_type FROM note_attachments a
       JOIN shift_notes n ON n.id = a.note_id
       WHERE a.id = ? AND n.store_id = ?`
    )
    .get(attachmentId, storeId) as { file_ref: string; content_type: string | null } | undefined;
}

export interface CreateNoteParams {
  storeId: string;
  shiftId: string | null;
  title: string;
  titleEs: string | null;
  text: string;
  sections: NoteSection[];
  authorId: string;
  attachments: Array<{ fileRef: string; originalName: string; contentType: string }>;
}

export function insertNote(params: CreateNoteParams, id: string, createdAt: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO shift_notes (id, store_id, shift_id, author_id, text, title, title_es, sections_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.storeId, params.shiftId, params.authorId, params.text, params.title, params.titleEs, JSON.stringify(params.sections), createdAt);
  const insertAttachment = db.prepare(
    `INSERT INTO note_attachments (id, note_id, file_ref, original_name, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const a of params.attachments) {
    insertAttachment.run(`${id}-${a.fileRef}`, id, a.fileRef, a.originalName, a.contentType, createdAt);
  }
}

export async function deleteShiftNote(id: string, storeId: string, actor: SessionUser) {
  const db = getDb();
  const attachments = db.prepare(`SELECT file_ref FROM note_attachments WHERE note_id = ?`).all(id) as Array<{ file_ref: string }>;
  db.prepare(`DELETE FROM shift_notes WHERE id = ? AND store_id = ?`).run(id, storeId); // cascades note_attachments rows
  writeAudit({ entityType: "shift_note", entityId: id, actor, action: "CANCELLED" });
  // Best-effort: an already-missing file (or a filesystem hiccup) shouldn't
  // block the note itself from being deleted, which is the part that matters.
  await Promise.all(attachments.map((a) => unlink(path.join(ATTACHMENT_DIR, a.file_ref)).catch(() => {})));
}
