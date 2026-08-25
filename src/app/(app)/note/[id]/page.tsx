import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getNoteDetail } from "@/lib/services/noteService";
import { formatStoreDateTime } from "@/lib/storeTime";
import { resolveBackHref } from "@/lib/backHref";
import PageHeader from "@/components/PageHeader";
import AttachmentViewerLink from "@/components/AttachmentViewerLink";
import NoteDetailActions from "@/components/NoteDetailActions";

export default async function NoteDetailPage({ params, searchParams }: PageProps<"/note/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const note = getNoteDetail(id, user.storeId);
  if (!note) notFound();

  const locale = user.language === "es" ? "es-MX" : "en-US";
  const timeLabel = formatStoreDateTime(user.storeId, note.created_at, locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const backHref = resolveBackHref(sp.from, "/more/notes");
  const isEs = user.language === "es";
  const title = (isEs && note.title_es) || note.title;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref={backHref} lang={user.language} title={title || (isEs ? "Nota" : "Note")} />
      <p className="mb-4 text-xs text-muted">
        {note.author_name || (isEs ? "Desconocido" : "Unknown")} · {timeLabel}
      </p>

      {note.text && <p className="mb-4 whitespace-pre-wrap text-sm text-foreground">{note.text}</p>}

      {note.sections.length > 0 && (
        <div className="mb-5 flex flex-col gap-4">
          {note.sections.map((s, i) => {
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

      {note.attachments.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Archivos adjuntos" : "Attachments"}
          </h2>
          <div className="card divide-y divide-border">
            {note.attachments.map((a) => (
              <AttachmentViewerLink
                key={a.id}
                href={`/api/note-attachments/${a.id}`}
                label={`📎 ${a.original_name || (user.language === "es" ? "Archivo" : "File")}`}
                lang={user.language}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-accent"
              />
            ))}
          </div>
        </div>
      )}

      <NoteDetailActions id={note.id} lang={user.language} backHref={backHref} />
    </div>
  );
}
