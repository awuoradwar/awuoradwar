import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLatestHandoff, getLastAcknowledgedAt } from "@/lib/services/handoffService";
import { getRecentActivity } from "@/lib/services/activityService";
import { getTodayNotes } from "@/lib/services/noteService";
import { t } from "@/lib/i18n";
import { formatStoreDateTime, storeToday } from "@/lib/storeTime";
import { attendanceTypeLabel } from "@/lib/attendanceLabels";
import HandoffActions from "@/components/HandoffActions";
import ActivityFeed from "@/components/ActivityFeed";
import ShiftNoteRow from "@/components/ShiftNoteRow";

export default async function HandoffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const handoff = getLatestHandoff(user.storeId);
  const since = getLastAcknowledgedAt(user.storeId, user.id);
  const activity = getRecentActivity(user.storeId, since, 50);
  const summary = handoff ? JSON.parse(handoff.generated_summary) : null;
  const todayNotes = getTodayNotes(user.storeId, storeToday(user.storeId));
  const locale = user.language === "es" ? "es-MX" : "en-US";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
      <section>
        <h1 className="mb-1 text-lg font-semibold">{t(user.language, "handoff_title")}</h1>
        <p className="text-xs text-muted">
          {handoff
            ? `${handoff.outgoing_pic_name || "—"} → ${handoff.incoming_pic_name || (user.language === "es" ? "pendiente" : "pending")}`
            : user.language === "es"
              ? "Aún no se ha generado ninguna entrega."
              : "No handoff generated yet."}
        </p>
      </section>

      {todayNotes.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{user.language === "es" ? "Notas" : "Notes"}</h2>
          <div className="flex flex-col gap-2">
            {todayNotes.map((note) => (
              <ShiftNoteRow
                key={note.id}
                note={note}
                lang={user.language}
                timeLabel={formatStoreDateTime(user.storeId, note.created_at, locale, { hour: "numeric", minute: "2-digit" })}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "handoff_since_you_were_here")}</h2>
        <p className="mb-2 text-xs text-muted">
          {user.language === "es"
            ? "En vivo -- lo que el equipo ha hecho, sin generar ni confirmar nada."
            : "Live -- what the team has actually done, no generating or acknowledging needed."}
        </p>
        <ActivityFeed items={activity} lang={user.language} storeId={user.storeId} />
      </section>

      <HandoffActions lang={user.language} handoff={handoff ? { id: handoff.id, status: handoff.status, outgoing_note: handoff.outgoing_note } : null} />

      {summary && (
        <>
          <SummarySection titleKey="handoff_staffing" lang={user.language} items={summary.staffing.map((s: { employee_name: string; type: string }) => `${s.employee_name} — ${attendanceTypeLabel(s.type, user.language)}`)} />
          <SummarySection titleKey="handoff_completed_work" lang={user.language} items={summary.completedHighValue.map((c: { title: string; completed_by_name: string | null }) => `${c.title}${c.completed_by_name ? " · " + c.completed_by_name : ""}`)} />
          <SummarySection titleKey="handoff_unresolved" lang={user.language} items={summary.unresolved.map((u: { title: string }) => u.title)} />
          <SummarySection titleKey="handoff_open_items" lang={user.language} items={summary.openItems.map((o: { title: string }) => o.title)} />
          <SummarySection
            titleKey="handoff_upcoming"
            lang={user.language}
            items={summary.upcoming.map(
              (u: { title: string; due_at: string | null }) => `${u.title}${u.due_at ? " — " + formatStoreDateTime(user.storeId, u.due_at, user.language === "es" ? "es-MX" : "en-US") : ""}`
            )}
          />
        </>
      )}
    </div>
  );
}

function SummarySection({ titleKey, lang, items }: { titleKey: string; lang: "en" | "es"; items: string[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(lang, titleKey as never)}</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">{t(lang, "all_clear")}</p>
      ) : (
        <div className="card divide-y divide-border">
          {items.map((it, i) => (
            <p key={i} className="px-3 py-2 text-sm">
              {it}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
