"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShiftNoteAction } from "@/app/actions/operationsActions";
import EditNoteForm from "./EditNoteForm";
import AttachmentViewerLink from "./AttachmentViewerLink";
import { btnOutline, btnDanger } from "./forms/FormShell";
import { Language } from "@/lib/types";
import type { NoteSection, NoteAttachment } from "@/lib/services/noteService";

export default function NoteDetailBody({
  id,
  title,
  notedAtLocal,
  authorLabel,
  text,
  sections,
  attachments,
  lang,
  backHref,
}: {
  id: string;
  title: string;
  notedAtLocal: string;
  authorLabel: string;
  text: string;
  sections: NoteSection[];
  attachments: NoteAttachment[];
  lang: Language;
  backHref: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEs = lang === "es";

  if (editing) {
    return (
      <EditNoteForm
        noteId={id}
        title={title}
        notedAtLocal={notedAtLocal}
        sections={sections}
        attachmentCount={attachments.length}
        lang={lang}
        onDone={() => {
          // Same "drop back to where you'd expect" behavior as saving a new
          // note -- back to wherever this note was opened from (Notes
          // history, most of the time) rather than sitting on the detail
          // page waiting for a manual back tap.
          router.push(backHref);
          router.refresh();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <p className="mb-4 text-xs text-muted">{authorLabel}</p>

      {text && <p className="mb-4 whitespace-pre-wrap text-sm text-foreground">{text}</p>}

      {sections.length > 0 && (
        <div className="mb-5 flex flex-col gap-4">
          {sections.map((s, i) => {
            const topic = (isEs && s.topicEs) || s.topic;
            const subtopic = (isEs && s.subtopicEs) || s.subtopic;
            const bullets = isEs && s.bulletsEs?.some((b) => b) ? s.bullets.map((b, bi) => s.bulletsEs[bi] || b) : s.bullets;
            return (
              <div key={i}>
                {topic && <h2 className="text-sm font-bold text-foreground">{topic}</h2>}
                {subtopic && <h3 className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">{subtopic}</h3>}
                {bullets.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {bullets.map((b, bi) => (
                      <li key={bi}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{isEs ? "Archivos adjuntos" : "Attachments"}</h2>
          <div className="card divide-y divide-border">
            {attachments.map((a) => (
              <AttachmentViewerLink
                key={a.id}
                href={`/api/note-attachments/${a.id}`}
                label={`📎 ${a.original_name || (isEs ? "Archivo" : "File")}`}
                lang={lang}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-accent"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditing(true)} className={btnOutline}>
          ✎ {isEs ? "Editar" : "Edit"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const msg = isEs ? "¿Eliminar esta nota? Esto no se puede deshacer." : "Delete this note? This can't be undone.";
            if (!window.confirm(msg)) return;
            startTransition(async () => {
              await deleteShiftNoteAction(id);
              router.push(backHref);
            });
          }}
          className={btnDanger}
        >
          {pending ? "…" : isEs ? "Eliminar nota" : "Delete note"}
        </button>
      </div>
    </>
  );
}
