import "server-only";
import { getDb } from "../db";
import { newId, nowIso, writeAudit } from "../audit";
import { SessionUser } from "../types";

/**
 * Intelligent import (spec section 8). Full OCR/LLM extraction is out of
 * scope for this build slice -- this implements the required human-in-the-
 * loop pipeline (upload -> proposals -> review -> correct -> approve) with
 * a lightweight heuristic extractor so the workflow is fully exercisable.
 * Swap `extractProposals` for a real document-AI call later; nothing else
 * in the review/approve flow needs to change.
 */
export function ingestDocument(params: { storeId: string; filename: string; fileType: string; originalText: string; actor: SessionUser }) {
  const db = getDb();
  const docId = newId();
  db.prepare(`INSERT INTO documents (id, store_id, filename, file_type, original_text, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    docId,
    params.storeId,
    params.filename,
    params.fileType,
    params.originalText,
    params.actor.id,
    nowIso()
  );
  writeAudit({ entityType: "document", entityId: docId, actor: params.actor, action: "CREATED" });

  const proposals = extractProposals(params.originalText);
  for (const p of proposals) {
    const id = newId();
    db.prepare(
      `INSERT INTO import_proposals (id, document_id, extracted_type, extracted_text, proposed_title, confidence, review_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
    ).run(id, docId, p.type, p.sourceText, p.title, p.confidence, nowIso());
  }
  return docId;
}

function extractProposals(text: string) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Array<{ type: string; title: string; sourceText: string; confidence: number }> = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    let type = "INFO";
    if (/clean|sanitiz|wipe|scrub/.test(lower)) type = "CLEANING";
    else if (/by \d| deadline|before \d|due /.test(lower)) type = "DEADLINE";
    else if (/%|\$|target|goal|score/.test(lower)) type = "METRIC";
    else if (/order|check|verify|complete|submit|call/.test(lower)) type = "OPERATIONAL";
    out.push({ type, title: line.slice(0, 120), sourceText: line, confidence: 0.6 });
  }
  return out;
}

export function getInboxProposals(storeId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ip.*, d.filename FROM import_proposals ip JOIN documents d ON d.id = ip.document_id
       WHERE d.store_id = ? AND ip.review_status = 'PENDING' ORDER BY ip.created_at ASC`
    )
    .all(storeId);
}

export function approveProposal(proposalId: string, correctedTitle: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE import_proposals SET review_status = 'APPROVED', proposed_title = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`).run(correctedTitle, actor.id, ts, proposalId);
  writeAudit({ entityType: "import_proposal", entityId: proposalId, actor, action: "APPROVED", newValue: { title: correctedTitle } });
}

export function rejectProposal(proposalId: string, actor: SessionUser) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`UPDATE import_proposals SET review_status = 'REJECTED', reviewed_by = ?, reviewed_at = ? WHERE id = ?`).run(actor.id, ts, proposalId);
  writeAudit({ entityType: "import_proposal", entityId: proposalId, actor, action: "CANCELLED" });
}
