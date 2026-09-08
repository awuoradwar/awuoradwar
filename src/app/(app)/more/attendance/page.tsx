import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUpcomingCallInsAndLates, getPastCallInsAndLates, groupAttendanceDuplicates, AttendanceEventRow, AttendanceGroup } from "@/lib/services/attendanceService";
import { storeToday } from "@/lib/storeTime";
import { weekStartOf } from "@/lib/services/recurrenceService";
import AttendanceRow from "@/components/AttendanceRow";
import PageHeader from "@/components/PageHeader";
import HistoryByWeek, { groupByWeek } from "@/components/HistoryByWeek";

const CALL_IN_FLAG_THRESHOLD = 2;

function callInCount(groups: AttendanceGroup<AttendanceEventRow>[]): number {
  return groups.filter((g) => g.primary.type === "CALL_IN").length;
}

function weekSubtitle(groups: AttendanceGroup<AttendanceEventRow>[], lang: "en" | "es") {
  const callIns = groups.filter((g) => g.primary.type === "CALL_IN").length;
  const lates = groups.filter((g) => g.primary.type === "LATE").length;
  const parts: string[] = [];
  if (callIns) parts.push(lang === "es" ? `${callIns} avisos` : `${callIns} call-in${callIns === 1 ? "" : "s"}`);
  if (lates) parts.push(lang === "es" ? `${lates} tardanzas` : `${lates} late${lates === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const today = storeToday(user.storeId);
  const upcoming = groupAttendanceDuplicates(getUpcomingCallInsAndLates(user.storeId, today));
  const past = groupAttendanceDuplicates(getPastCallInsAndLates(user.storeId, today));

  // The week still in progress -- upcoming/past each only cover one side of
  // today, so a call-in logged this morning (past) and one already booked
  // for later this week (upcoming) both need combining to get this week's
  // real running total.
  const thisWeekStart = weekStartOf(today);
  const weeksSoFar = groupByWeek([...upcoming, ...past], (g) => g.primary.event_date || g.primary.created_at, user.storeId);
  const thisWeekCallIns = callInCount(weeksSoFar.find((w) => w.weekStart === thisWeekStart)?.items ?? []);
  const thisWeekFlagged = thisWeekCallIns > CALL_IN_FLAG_THRESHOLD;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/add" lang={lang} title={lang === "es" ? "Avisos e Impuntualidad" : "Call-in / Late"} />

      {thisWeekCallIns > 0 && (
        <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${thisWeekFlagged ? "bg-critical/10 text-critical" : "bg-card-subtle text-muted"}`}>
          {thisWeekFlagged ? "⚠ " : ""}
          {lang === "es"
            ? `${thisWeekCallIns} avisos esta semana`
            : `${thisWeekCallIns} call-in${thisWeekCallIns === 1 ? "" : "s"} this week`}
          {thisWeekFlagged && (lang === "es" ? " -- más de lo usual" : " -- more than usual")}
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Próximos" : "Upcoming"}</h2>
          {upcoming.length > 0 && <span className="text-xs font-semibold text-muted">{upcoming.length}</span>}
        </div>
        <p className="mb-2 text-xs text-muted">
          {lang === "es" ? "De hoy en adelante, por fecha" : "From today forward, by date"}
        </p>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
            {lang === "es" ? "Nada próximo." : "Nothing upcoming."}
          </p>
        ) : (
          <div className="card divide-y divide-border">
            {upcoming.map((g) => (
              <AttendanceRow key={g.primary.id} item={g.primary} duplicates={g.duplicates} lang={lang} from="/more/attendance" />
            ))}
          </div>
        )}
      </section>

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Historial" : "History"}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{past.length}</span>
        </summary>
        <HistoryByWeek
          items={past}
          getDate={(g) => g.primary.event_date || g.primary.created_at}
          keyOf={(g) => g.primary.id}
          storeId={user.storeId}
          renderItem={(g) => <AttendanceRow item={g.primary} duplicates={g.duplicates} lang={lang} from="/more/attendance" />}
          renderSubtitle={(groups) => weekSubtitle(groups, lang)}
          flagWeek={(groups) => callInCount(groups) > CALL_IN_FLAG_THRESHOLD}
          lang={lang}
          emptyLabel={lang === "es" ? "Ninguno todavía." : "None yet."}
        />
      </details>
    </div>
  );
}
