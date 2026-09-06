import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getArea, getSubmissionsForAreaInRange, ProcedureShiftType, ProcedureSubmission } from "@/lib/services/procedureService";
import { weekStartOf } from "@/lib/services/recurrenceService";
import { storeToday, formatStoreDateTime } from "@/lib/storeTime";
import PageHeader from "@/components/PageHeader";

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function addDaysStr(dateStr: string, days: number): string {
  return new Date(new Date(dateStr + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

function ShiftCell({ label, submissions, isPast, isToday, storeId, locale, es }: {
  label: string;
  submissions: ProcedureSubmission[];
  isPast: boolean;
  isToday: boolean;
  storeId: string;
  locale: string;
  es: boolean;
}) {
  if (submissions.length > 0) {
    return (
      <div className="flex items-start justify-between gap-2 text-sm">
        <span className="font-medium text-muted">{label}</span>
        <div className="text-right">
          {submissions.map((s) => (
            <p key={s.id} className="text-ok">
              ✓ {s.associate_name}
              <span className="ml-1 text-xs text-muted">{formatStoreDateTime(storeId, s.created_at, locale, { hour: "numeric", minute: "2-digit" })}</span>
            </p>
          ))}
        </div>
      </div>
    );
  }
  if (isPast) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted">{label}</span>
        <span className="rounded-full bg-critical/10 px-2 py-0.5 text-xs font-semibold text-critical">{es ? "Faltó" : "Missed"}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-muted">{label}</span>
      <span className="text-xs text-muted">{isToday ? (es ? "Pendiente" : "Pending") : "—"}</span>
    </div>
  );
}

export default async function ProcedureAreaDetailPage({ params, searchParams }: PageProps<"/more/procedures/[areaId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const es = user.language === "es";
  const locale = es ? "es-MX" : "en-US";
  const dayNames = es ? DAY_NAMES_ES : DAY_NAMES_EN;

  const { areaId } = await params;
  const area = getArea(areaId, user.storeId);
  if (!area) notFound();

  const sp = await searchParams;
  const today = storeToday(user.storeId);
  const currentWeekStart = weekStartOf(today);
  const requestedWeekStart = typeof sp.weekStart === "string" ? sp.weekStart : undefined;
  const start = weekStartOf(requestedWeekStart || currentWeekStart);
  const isCurrentWeek = start === currentWeekStart;
  const end = addDaysStr(start, 6);
  const prevWeekStart = addDaysStr(start, -7);
  const nextWeekStart = addDaysStr(start, 7);

  const submissions = getSubmissionsForAreaInRange(areaId, user.storeId, start, end);
  const byDayShift = new Map<string, ProcedureSubmission[]>();
  for (const s of submissions) {
    const key = `${s.submitted_date}:${s.shift_type}`;
    if (!byDayShift.has(key)) byDayShift.set(key, []);
    byDayShift.get(key)!.push(s);
  }
  function forDay(date: string, shiftType: ProcedureShiftType): ProcedureSubmission[] {
    return byDayShift.get(`${date}:${shiftType}`) || [];
  }

  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-5">
      <PageHeader backHref="/more/procedures" lang={user.language} title={area.name} />

      <div className="flex items-center justify-between">
        <Link href={`/more/procedures/${areaId}?weekStart=${prevWeekStart}`} className="text-sm font-medium text-accent">
          {es ? "← Sem. anterior" : "← Prev week"}
        </Link>
        <p className="text-xs font-semibold text-muted">
          {new Date(start + "T12:00:00Z").toLocaleDateString(locale, { month: "short", day: "numeric" })} –{" "}
          {new Date(end + "T12:00:00Z").toLocaleDateString(locale, { month: "short", day: "numeric" })}
        </p>
        {!isCurrentWeek ? (
          <Link href={`/more/procedures/${areaId}?weekStart=${nextWeekStart}`} className="text-sm font-medium text-accent">
            {es ? "Sem. siguiente →" : "Next week →"}
          </Link>
        ) : (
          <span className="text-sm text-muted">{es ? "Sem. siguiente →" : "Next week →"}</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {days.map((date) => {
          const isPast = date < today;
          const isToday = date === today;
          const d = new Date(date + "T12:00:00Z");
          return (
            <div key={date} className={`card flex flex-col gap-2 p-3 ${isToday ? "border-2 border-accent" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                {dayNames[d.getUTCDay()]}, {d.toLocaleDateString(locale, { month: "short", day: "numeric" })}
              </p>
              <ShiftCell label={es ? "Apertura" : "Opening"} submissions={forDay(date, "OPENING")} isPast={isPast} isToday={isToday} storeId={user.storeId} locale={locale} es={es} />
              <ShiftCell label={es ? "Cierre" : "Closing"} submissions={forDay(date, "CLOSING")} isPast={isPast} isToday={isToday} storeId={user.storeId} locale={locale} es={es} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
