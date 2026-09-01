"use client";

import { useState } from "react";
import { quickAddNoteAction } from "@/app/actions/quickAddActions";
import { useQuickAddSubmit } from "./useQuickAddSubmit";
import { Field, inputClass, textareaClass, FileField, SubmitBar, BulletPreview } from "./FormShell";
import { Language } from "@/lib/types";

interface SectionDraft {
  topic: string;
  subtopic: string;
  bulletsText: string;
}

const EMPTY_SECTION: SectionDraft = { topic: "", subtopic: "", bulletsText: "" };

/** "YYYY-MM-DDTHH:MM" for right now, in whoever's holding the phone's own
 * local time -- same assumption the rest of the app makes that the device's
 * clock matches the store's, since the person typing is standing in it. */
function nowLocalInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NoteForm({ lang }: { lang: Language }) {
  const [sections, setSections] = useState<SectionDraft[]>([{ ...EMPTY_SECTION }]);
  const { onSubmit, pending, error, status } = useQuickAddSubmit(
    null,
    quickAddNoteAction,
    (fd) => String(fd.get("title") || (lang === "es" ? "Nota" : "Note")),
    "/more/notes"
  );

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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="sectionsJson" value={sectionsJson} />
      <Field label={lang === "es" ? "Título" : "Title"}>
        <input
          name="title"
          required
          className={inputClass}
          placeholder={lang === "es" ? "ej. Reunión regional" : "e.g. Regional meeting"}
        />
      </Field>

      <Field label={lang === "es" ? "Fecha y hora" : "Date & time"}>
        <input name="notedAt" type="datetime-local" defaultValue={nowLocalInputValue()} required className={inputClass} />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="remindDayBefore" className="mt-0.5 h-4 w-4" />
        <span>
          {lang === "es" ? "Mostrar también un día antes" : "Also show this the day before"}
          <span className="block text-xs text-muted">
            {lang === "es"
              ? "Para algo como las notas de una reunión de área -- aparece en Notas de Hoy la fecha de arriba y también el día anterior."
              : "For something like area meeting notes -- shows up in Today's Notes on the date above and the day before it too."}
          </span>
        </span>
      </label>

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
            <input
              value={s.topic}
              onChange={(e) => updateSection(i, { topic: e.target.value })}
              className={inputClass}
              placeholder={lang === "es" ? "ej. Metas de ventas" : "e.g. Sales goals"}
            />
          </Field>
          <Field label={`${lang === "es" ? "Subtema" : "Subtopic"} (${lang === "es" ? "opcional" : "optional"})`}>
            <input
              value={s.subtopic}
              onChange={(e) => updateSection(i, { subtopic: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={`${lang === "es" ? "Puntos" : "Bullet points"} (${lang === "es" ? "uno por línea" : "one per line"})`}>
            <textarea
              value={s.bulletsText}
              onChange={(e) => updateSection(i, { bulletsText: e.target.value })}
              rows={3}
              className={textareaClass}
            />
          </Field>
          <BulletPreview text={s.bulletsText} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setSections((prev) => [...prev, { ...EMPTY_SECTION }])}
        className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar otro tema" : "+ Add another topic"}
      </button>

      <Field label={`${lang === "es" ? "Fotos o documentos" : "Photos or documents"} (${lang === "es" ? "opcional" : "optional"})`}>
        <FileField name="attachments" multiple accept="image/*,.pdf,.doc,.docx" lang={lang} />
      </Field>

      <SubmitBar pending={pending} error={error} status={status} lang={lang} label={lang === "es" ? "Guardar" : "Save"} />
    </form>
  );
}
