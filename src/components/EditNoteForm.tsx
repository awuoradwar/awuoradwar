"use client";

import { useState, useTransition } from "react";
import { updateNoteAction } from "@/app/actions/quickAddActions";
import { Field, inputClass, textareaClass, FileField, btnPrimary, btnNeutral } from "./forms/FormShell";
import { Language } from "@/lib/types";
import type { NoteSection } from "@/lib/services/noteService";

interface SectionDraft {
  topic: string;
  subtopic: string;
  bulletsText: string;
}

const EMPTY_SECTION: SectionDraft = { topic: "", subtopic: "", bulletsText: "" };

function toDrafts(sections: NoteSection[]): SectionDraft[] {
  if (sections.length === 0) return [{ ...EMPTY_SECTION }];
  return sections.map((s) => ({ topic: s.topic, subtopic: s.subtopic, bulletsText: s.bullets.join("\n") }));
}

export default function EditNoteForm({
  noteId,
  title,
  notedAtLocal,
  sections: initialSections,
  attachmentCount,
  lang,
  onDone,
  onCancel,
}: {
  noteId: string;
  title: string;
  notedAtLocal: string;
  sections: NoteSection[];
  attachmentCount: number;
  lang: Language;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [sections, setSections] = useState<SectionDraft[]>(toDrafts(initialSections));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateSection(i: number, patch: Partial<SectionDraft>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  const sectionsJson = JSON.stringify(
    sections.map((s) => ({
      topic: s.topic.trim(),
      subtopic: s.subtopic.trim(),
      bullets: s.bulletsText.split("\n").map((b) => b.trim()).filter(Boolean),
    }))
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateNoteAction(noteId, fd);
          if (result && "error" in result && result.error) {
            setError(result.error);
            return;
          }
          setError(null);
          onDone();
        });
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="sectionsJson" value={sectionsJson} />
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input name="title" defaultValue={title} required className={inputClass} />
      </Field>

      <Field label={lang === "es" ? "Fecha y hora" : "Date & time"}>
        <input name="notedAt" type="datetime-local" defaultValue={notedAtLocal} required className={inputClass} />
      </Field>

      {sections.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">
              {lang === "es" ? `Tema ${i + 1}` : `Topic ${i + 1}`}
            </span>
            {sections.length > 1 && (
              <button
                type="button"
                onClick={() => setSections((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-xs font-medium text-critical"
              >
                {lang === "es" ? "Quitar" : "Remove"}
              </button>
            )}
          </div>
          <Field label={lang === "es" ? "Tema" : "Topic"}>
            <input value={s.topic} onChange={(e) => updateSection(i, { topic: e.target.value })} className={inputClass} />
          </Field>
          <Field label={`${lang === "es" ? "Subtema" : "Subtopic"} (${lang === "es" ? "opcional" : "optional"})`}>
            <input value={s.subtopic} onChange={(e) => updateSection(i, { subtopic: e.target.value })} className={inputClass} />
          </Field>
          <Field label={`${lang === "es" ? "Puntos" : "Bullet points"} (${lang === "es" ? "uno por línea" : "one per line"})`}>
            <textarea value={s.bulletsText} onChange={(e) => updateSection(i, { bulletsText: e.target.value })} rows={3} className={textareaClass} />
          </Field>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setSections((prev) => [...prev, { ...EMPTY_SECTION }])}
        className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar otro tema" : "+ Add another topic"}
      </button>

      <Field
        label={`${lang === "es" ? "Agregar fotos o documentos" : "Add photos or documents"} ${
          attachmentCount > 0 ? `(${attachmentCount} ${lang === "es" ? "ya adjuntos" : "already attached"})` : `(${lang === "es" ? "opcional" : "optional"})`
        }`}
      >
        <FileField name="attachments" multiple accept="image/*,.pdf,.doc,.docx" lang={lang} />
      </Field>

      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "…" : lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={btnNeutral}>
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
