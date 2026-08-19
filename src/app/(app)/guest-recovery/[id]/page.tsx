import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { lastUpdatedBy } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { formatStoreDateTime } from "@/lib/storeTime";
import StatusBadge from "@/components/StatusBadge";
import GuestRecoveryDetailActions from "@/components/GuestRecoveryDetailActions";
import ActivityLog from "@/components/ActivityLog";
import PageHeader from "@/components/PageHeader";

interface GuestRecoveryRow {
  id: string;
  contact_channel: string;
  order_channel: string;
  issue_category: string;
  description: string | null;
  item_description: string | null;
  guest_name: string | null;
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

  const last = lastUpdatedBy("guest_recovery", id) as { actor_name: string | null; created_at: string } | undefined;
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(user.storeId, iso, locale);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader
        backHref="/more/meal-replacements"
        lang={user.language}
        title={`${user.language === "es" ? "Reemplazo de Comida" : "Meal Replacement"}: ${gr.issue_category}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={gr.replacement_status} lang={user.language} />
        <span className="text-xs text-muted">{fmt(gr.created_at)}</span>
      </div>
      {gr.description && <p className="mt-3 text-sm text-muted">{gr.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">{t(user.language, "field_contact_channel")}</dt>
        <dd>{gr.contact_channel.replace("_", " ")}</dd>
        <dt className="text-muted">{t(user.language, "field_order_channel")}</dt>
        <dd>{gr.order_channel.replace("_", " ")}</dd>
        {gr.guest_name && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Nombre del Cliente" : "Guest Name"}</dt>
            <dd>{gr.guest_name}</dd>
          </>
        )}
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
        {gr.approved_by_name && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Aprobado Por" : "Approved By"}</dt>
            <dd>{gr.approved_by_name}</dd>
          </>
        )}
        {gr.completed_by_name && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Cumplido Por" : "Fulfilled By"}</dt>
            <dd>{gr.completed_by_name}</dd>
          </>
        )}
        {last && (
          <>
            <dt className="text-muted">{t(user.language, "field_last_updated_by")}</dt>
            <dd>
              {last.actor_name || "system"} · {fmt(last.created_at)}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <GuestRecoveryDetailActions id={gr.id} lang={user.language} status={gr.replacement_status} />
      </div>

      <ActivityLog entityType="guest_recovery" entityId={id} storeId={user.storeId} lang={user.language} />
    </div>
  );
}
