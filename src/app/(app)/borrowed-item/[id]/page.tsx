import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getActivity, lastUpdatedBy } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { utcToStoreLocalInput, formatStoreDateTime } from "@/lib/storeTime";
import StatusBadge from "@/components/StatusBadge";
import BorrowedItemDetailActions from "@/components/BorrowedItemDetailActions";
import BorrowedItemEditableFields from "@/components/BorrowedItemEditableFields";
import PageHeader from "@/components/PageHeader";

interface BorrowedItemRow {
  id: string;
  direction: "BORROWED" | "LENT";
  borrowed_from: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  approved_by_name: string | null;
  picked_up_by_name: string | null;
  picked_up_at: string | null;
  settlement_method: string | null;
  status: string;
  owner_name: string | null;
  completed_by_name: string | null;
  notes: string | null;
  created_at: string;
}

export default async function BorrowedItemDetailPage({ params }: PageProps<"/borrowed-item/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const item = db
    .prepare(
      `SELECT bi.*, ou.name as owner_name, cu.name as completed_by_name
       FROM borrowed_items bi
       LEFT JOIN users ou ON ou.id = bi.owner_id
       LEFT JOIN users cu ON cu.id = bi.completed_by
       WHERE bi.id = ?`
    )
    .get(id) as BorrowedItemRow | undefined;
  if (!item) notFound();

  const activity = getActivity("borrowed_item", id) as Array<{
    id: string;
    action: string;
    actor_name: string | null;
    created_at: string;
  }>;
  const last = lastUpdatedBy("borrowed_item", id) as { actor_name: string | null; created_at: string } | undefined;
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(user.storeId, iso, locale);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more/search" lang={user.language} title={item.item} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={item.status} lang={user.language} />
        <span className="text-xs text-muted">{fmt(item.created_at)}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <BorrowedItemEditableFields
          id={item.id}
          lang={user.language}
          direction={item.direction}
          borrowedFrom={item.borrowed_from}
          item={item.item}
          quantity={item.quantity}
          unit={item.unit}
          approvedByName={item.approved_by_name}
          pickedUpByName={item.picked_up_by_name}
          pickedUpAtLocal={item.picked_up_at ? utcToStoreLocalInput(user.storeId, item.picked_up_at) : null}
        />
        <dt className="text-muted">{t(user.language, "field_owner")}</dt>
        <dd>{item.owner_name || "—"}</dd>
        {item.completed_by_name && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Completado Por" : "Completed By"}</dt>
            <dd>{item.completed_by_name}</dd>
          </>
        )}
        {item.notes && (
          <>
            <dt className="text-muted">{t(user.language, "field_notes")}</dt>
            <dd>{item.notes}</dd>
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
        <BorrowedItemDetailActions id={item.id} lang={user.language} status={item.status} settlementMethod={item.settlement_method} />
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
              <p className="text-muted">{fmt(a.created_at)}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
