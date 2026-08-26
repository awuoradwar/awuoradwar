import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getNoteDetail } from "@/lib/services/noteService";
import { formatStoreDateTime, utcToStoreLocalInput } from "@/lib/storeTime";
import { resolveBackHref } from "@/lib/backHref";
import PageHeader from "@/components/PageHeader";
import NoteDetailBody from "@/components/NoteDetailBody";

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
  const authorLabel = `${note.author_name || (isEs ? "Desconocido" : "Unknown")} · ${timeLabel}`;
  const notedAtLocal = utcToStoreLocalInput(user.storeId, note.created_at);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref={backHref} lang={user.language} title={title || (isEs ? "Nota" : "Note")} />
      <NoteDetailBody
        id={note.id}
        title={note.title || ""}
        notedAtLocal={notedAtLocal}
        authorLabel={authorLabel}
        text={note.text}
        sections={note.sections}
        attachments={note.attachments}
        lang={user.language}
        backHref={backHref}
      />
    </div>
  );
}
