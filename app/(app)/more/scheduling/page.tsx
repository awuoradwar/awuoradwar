import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { getPendingQueue, getAllRequests } from "@/lib/services/schedulingService";
import ScheduleRequestForm from "@/components/ScheduleRequestForm";
import ApprovalQueueRow from "@/components/ApprovalQueueRow";
import ConflictCheckTool from "@/components/ConflictCheckTool";
import StatusBadge from "@/components/StatusBadge";
import { t } from "@/lib/i18n";

interface RequestRow {
  id: string;
  associate_name: string;
  request_type: string;
  requested_start_date: string;
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

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <Link href="/more" className="mb-3 inline-block text-sm text-muted">
        ← {user.language === "es" ? "Atrás" : "Back"}
      </Link>
      <h1 className="mb-4 text-lg font-semibold">{user.language === "es" ? "Solicitudes de Horario" : "Scheduling Requests"}</h1>

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
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.associate_name} · {r.request_type.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted">
                  {r.requested_start_date} · {r.received_via} · {r.received_by_name}
                  {r.attachment_count ? (
                    <>
                      {" · "}
                      <a href={`/api/schedule-attachments/${r.id}`} target="_blank" rel="noreferrer" className="text-accent underline">
                        📎
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <StatusBadge status={r.status} lang={user.language} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
