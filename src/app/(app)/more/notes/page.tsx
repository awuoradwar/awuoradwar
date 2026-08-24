import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getNotesHistory } from "@/lib/services/noteService";
import { formatStoreDateTime } from "@/lib/storeTime";
import PageHeader from "@/components/PageHeader";
import HistoryByWeek from "@/components/HistoryByWeek";
import ShiftNoteRow from "@/components/ShiftNoteRow";

export default async function NotesHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;
  const locale = lang === "es" ? "es-MX" : "en-US";

  const notes = getNotesHistory(user.storeId);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/add" lang={lang} title={lang === "es" ? "Notas" : "Notes"} />

      <Link
        href="/add/note"
        className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar nota" : "+ Add note"}
      </Link>

      <div className="card overflow-hidden">
        <HistoryByWeek
          items={notes}
          getDate={(n) => n.created_at}
          keyOf={(n) => n.id}
          storeId={user.storeId}
          lang={lang}
          emptyLabel={lang === "es" ? "Ninguna todavía." : "None yet."}
          renderItem={(n) => (
            <ShiftNoteRow
              note={n}
              lang={lang}
              timeLabel={formatStoreDateTime(user.storeId, n.created_at, locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              from="/more/notes"
            />
          )}
        />
      </div>
    </div>
  );
}
