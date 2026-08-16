import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getActivity, lastUpdatedBy } from "@/lib/audit";
import { t } from "@/lib/i18n";
import StatusBadge from "@/components/StatusBadge";
import GuestRecoveryDetailActions from "@/components/GuestRecoveryDetailActions";
import PageHeader from "@/components/PageHeader";

interface GuestRecoveryRow {
  id: string;
  contact_channel: string;
  order_channel: string;
  issue_category: string;
  description: string | null;
  item_description: string | null;
  value_estimate: number | null;
  replacement_status: string;
  approved_by_name: string | null;
  completed_by_name: string | null;
  follow_up_task_id: string | null;
  created_at: string;
}

export default async function GuestRecoveryDetailPage({ params }: PageProps<"/guest-recovery/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const gr = db
    .prepare(
      `SELECT gr.*, au.name as approved_by_name, cu.name as completed_by_name
       FROM guest_recoveries gr
       LEFT JOIN users au ON au.id = gr.approved_by
       LEFT JOIN users cu ON cu.id = gr.completed_by
       WHERE gr.id = ?`
    )
    .get(id) as GuestRecoveryRow | undefined;
  if (!gr) notFound();

  const activity = getActivity("guest_recovery", id) as Array<{
    id: string;
    action: string;
    actor_name: string | null;
    created_at: string;
  }>;
  const last = lastUpdatedBy("guest_recovery", id) as { actor_name: string | null; created_at: string } | undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader
        backHref="/more/search"
        lang={user.language}
        title={`${user.language === "es" ? "Recuperación de Cliente" : "Guest Recovery"}: ${gr.issue_category}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={gr.replacement_status} lang={user.language} />
        <span className="text-xs text-muted">{new Date(gr.created_at).toLocaleString()}</span>
      </div>
      {gr.description && <p className="mt-3 text-sm text-muted">{gr.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">{t(user.language, "field_contact_channel")}</dt>
        <dd>{gr.contact_channel.replace("_", " ")}</dd>
        <dt className="text-muted">{t(user.language, "field_order_channel")}</dt>
        <dd>{gr.order_channel.replace("_", " ")}</dd>
        {gr.item_description && (
          <>
            <dt className="text-muted">{t(user.language, "field_item_description")}</dt>
            <dd>{gr.item_description}</dd>
          </>
        )}
        {gr.value_estimate != null && (
          <>
            <dt className="text-muted">{t(user.language, "field_value_estimate")}</dt>
            <dd>${gr.value_estimate.toFixed(2)}</dd>
          </>
        )}
        <dt className="text-muted">{user.language === "es" ? "Aprobado Por" : "Approved By"}</dt>
        <dd>{gr.approved_by_name || "—"}</dd>
        {gr.completed_by_name && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Completado Por" : "Completed By"}</dt>
            <dd>{gr.completed_by_name}</dd>
          </>
        )}
        {last && (
          <>
            <dt className="text-muted">{t(user.language, "field_last_updated_by")}</dt>
            <dd>
              {last.actor_name || "system"} · {new Date(last.created_at).toLocaleString()}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <GuestRecoveryDetailActions id={gr.id} lang={user.language} status={gr.replacement_status} />
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-accent">
          {t(user.language, "action_view_activity")} ({activity.length})
        </summary>
        <div className="card mt-2 divide-y divide-border">
          {activity.length === 0 && <p className="px-3 py-2 text-xs text-muted">{t(user.language, "detail_activity_none")}</p>}
          {activity.map((a) => (
            <div key={a.id} className="px-3 py-2 text-xs">
              <p className="font-medium">
                {a.action} · {a.actor_name || "system"}
              </p>
              <p className="text-muted">{new Date(a.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
