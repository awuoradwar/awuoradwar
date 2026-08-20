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
}

export default function AttendanceRow({ item, lang }: { item: AttendanceRowData; lang: Language }) {
  return (
    <Link href={`/attendance/${item.id}`} className="flex items-center gap-2 px-3 py-2">
      <span className="text-lg">{item.type === "LATE" ? "⏰" : "🧍"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {item.employee_name} — {attendanceTypeLabel(item.type, lang)}
        </p>
        <p className="truncate text-xs text-muted">
          {item.event_date || "—"}
          {item.scheduled_time && <span> · {item.scheduled_time}</span>}
          {item.note && <span> · {item.note}</span>}
        </p>
      </div>
    </Link>
  );
}
