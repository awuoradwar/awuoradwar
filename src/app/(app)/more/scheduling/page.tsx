import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { getPendingQueue, getAllRequests } from "@/lib/services/schedulingService";
import { getActivity } from "@/lib/audit";
import { formatStoreDateTime } from "@/lib/storeTime";
import { summarizeActivityChange } from "@/lib/activitySummary";
import ScheduleRequestForm from "@/components/ScheduleRequestForm";
import ApprovalQueueRow from "@/components/ApprovalQueueRow";
import ConflictCheckTool from "@/components/ConflictCheckTool";
import ScheduleRequestRow, { ActivityEntry } from "@/components/ScheduleRequestRow";
import PageHeader from "@/components/PageHeader";
import { t } from "@/lib/i18n";

interface RequestRow {
  id: string;
  associate_name: string;
  request_type: string;
  requested_start_date: string;
  requested_end_date: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  notes: string | null;
  received_via: string;
  received_by_name: string | null;
  status: string;
  attachment_count?: number;
}

export default async function SchedulingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pending = getPendingQueue(user.storeId) as RequestRow[];
  const all = getAllRequests(user.storeId) as RequestRow[];
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const activityByRequest = new Map<string, ActivityEntry[]>(
    all.map((r) => {
      const rows = getActivity("schedule_request", r.id) as Array<{
        id: string;
        action: string;
        actor_name: string | null;
        old_value: string | null;
        new_value: string | null;
        created_at: string;
      }>;
      return [
        r.id,
        rows.map((a) => ({
          id: a.id,
          action: a.action,
          actorName: a.actor_name,
          summary: summarizeActivityChange(a.old_value, a.new_value, user.language),
          formattedAt: formatStoreDateTime(user.storeId, a.created_at, locale),
        })),
      ];
    })
  );

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Solicitudes de Horario" : "Scheduling Requests"} />

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Registrar solicitud" : "Record a request"}
        </h2>
        <ScheduleRequestForm lang={user.language} isGM={isGM(user)} />
      </section>

      {isGM(user) && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Cola de aprobación del GM" : "GM approval queue"}
          </h2>
          {pending.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
              {user.language === "es" ? "Nada pendiente." : "Nothing pending."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((r) => (
                <ApprovalQueueRow key={r.id} request={r} lang={user.language} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {t(user.language, "scheduling_conflict_check_title")}
        </h2>
        <ConflictCheckTool lang={user.language} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Todas las solicitudes" : "All requests"}
        </h2>
        <div className="card divide-y divide-border">
          {all.map((r) => (
            <ScheduleRequestRow key={r.id} request={r} lang={user.language} activity={activityByRequest.get(r.id) || []} />
          ))}
        </div>
      </section>
    </div>
  );
}
