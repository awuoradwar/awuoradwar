import Link from "next/link";
import { Language } from "@/lib/types";
import { attendanceTypeLabel } from "@/lib/attendanceLabels";

export interface AttendanceRowData {
  id: string;
  employee_name: string;
  type: string;
  event_date: string | null;
  scheduled_time: string | null;
  note: string | null;
  recorded_by_name?: string | null;
}

/** duplicates: other independently-logged reports of this same real-world
 * event (e.g. an associate reached two different managers, and both entered
 * it) -- kept visible below the primary row instead of discarded, so no one
 * wonders where "their" entry went, but the row and any count built from
 * this list still reads as one event. */
export default function AttendanceRow({ item, lang, duplicates }: { item: AttendanceRowData; lang: Language; duplicates?: AttendanceRowData[] }) {
  return (
    <div className="px-3 py-2">
      <Link href={`/attendance/${item.id}`} className="flex items-center gap-2">
        <span className="text-lg">{item.type === "LATE" ? "⏰" : "🧍"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            {item.employee_name} — {attendanceTypeLabel(item.type, lang)}
          </p>
          <p className="truncate text-xs text-muted">
            {item.event_date || "—"}
            {item.scheduled_time && <span> · {item.scheduled_time}</span>}
            {item.recorded_by_name && <span> · {item.recorded_by_name}</span>}
            {item.note && <span> · {item.note}</span>}
          </p>
        </div>
      </Link>
      {duplicates && duplicates.length > 0 && (
        <details className="mt-1 ml-7">
          <summary className="cursor-pointer text-xs font-semibold text-accent">
            {lang === "es"
              ? `También reportado ${duplicates.length === 1 ? "1 vez más" : `${duplicates.length} veces más`}`
              : `Also reported ${duplicates.length === 1 ? "once more" : `${duplicates.length} more times`}`}
          </summary>
          <div className="mt-1 flex flex-col gap-1 border-l-2 border-border pl-2.5">
            {duplicates.map((d) => (
              <Link key={d.id} href={`/attendance/${d.id}`} className="block text-xs text-muted hover:text-accent">
                {d.recorded_by_name || (lang === "es" ? "gerente" : "manager")}
                {d.note ? ` · ${d.note}` : ""}
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
