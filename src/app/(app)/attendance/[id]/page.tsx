import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAttendanceEvent, getAttendanceFollowups } from "@/lib/services/attendanceService";
import { lastUpdatedBy } from "@/lib/audit";
import { formatStoreDateTime } from "@/lib/storeTime";
import { t } from "@/lib/i18n";
import { attendanceTypeLabel } from "@/lib/attendanceLabels";
import AttendanceEditableFields from "@/components/AttendanceEditableFields";
import AttendanceFollowups from "@/components/AttendanceFollowups";
import ActivityLog from "@/components/ActivityLog";
import PageHeader from "@/components/PageHeader";
import { resolveBackHref } from "@/lib/backHref";

export default async function AttendanceDetailPage({ params, searchParams }: PageProps<"/attendance/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = getAttendanceEvent(id, user.storeId);
  if (!event) notFound();

  const last = lastUpdatedBy("attendance_event", id) as { actor_name: string | null; created_at: string } | undefined;
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(user.storeId, iso, locale);
  const title = attendanceTypeLabel(event.type, user.language);
  const followups = getAttendanceFollowups(id).map((f) => ({ ...f, formattedAt: fmt(f.created_at) }));

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref={resolveBackHref(sp.from, "/my-shift")} lang={user.language} title={title} />
      <p className="mt-2 text-xs text-muted">{fmt(event.created_at)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <AttendanceEditableFields
          id={event.id}
          lang={user.language}
          type={event.type}
          employeeName={event.employee_name}
          eventDate={event.event_date}
          scheduledTime={event.scheduled_time}
          actualTime={event.actual_time}
          notifiedAt={event.notified_at}
          notificationMethod={event.notification_method}
          attachmentRef={event.attachment_ref}
          coverageStatus={event.coverage_status}
          coveringPerson={event.covering_person}
          note={event.note}
        />
        {last && (
          <>
            <dt className="text-muted">{t(user.language, "field_last_updated_by")}</dt>
            <dd>
              {last.actor_name || "system"} · {fmt(last.created_at)}
            </dd>
          </>
        )}
      </dl>

      <AttendanceFollowups eventId={id} followups={followups} lang={user.language} />

      <ActivityLog entityType="attendance_event" entityId={id} storeId={user.storeId} lang={user.language} />
    </div>
  );
}
