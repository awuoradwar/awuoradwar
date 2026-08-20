import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUpcomingCallInsAndLates, getPastCallInsAndLates } from "@/lib/services/attendanceService";
import { storeToday } from "@/lib/storeTime";
import AttendanceRow from "@/components/AttendanceRow";
import PageHeader from "@/components/PageHeader";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const today = storeToday(user.storeId);
  const upcoming = getUpcomingCallInsAndLates(user.storeId, today);
  const past = getPastCallInsAndLates(user.storeId, today);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/add" lang={lang} title={lang === "es" ? "Avisos e Impuntualidad" : "Call-in / Late"} />

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
            {upcoming.map((item) => (
              <AttendanceRow key={item.id} item={item} lang={lang} />
            ))}
          </div>
        )}
      </section>

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Historial" : "History"}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{past.length}</span>
        </summary>
        {past.length === 0 ? (
          <p className="border-t border-border p-4 text-center text-xs text-muted">{lang === "es" ? "Ninguno todavía." : "None yet."}</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {past.map((item) => (
              <AttendanceRow key={item.id} item={item} lang={lang} />
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
