import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCateringOrder } from "@/lib/services/cateringService";
import { lastUpdatedBy } from "@/lib/audit";
import { formatStoreDateTime } from "@/lib/storeTime";
import { t } from "@/lib/i18n";
import CateringOrderRow from "@/components/CateringOrderRow";
import ActivityLog from "@/components/ActivityLog";
import PageHeader from "@/components/PageHeader";
import { resolveBackHref } from "@/lib/backHref";

export default async function CateringDetailPage({ params, searchParams }: PageProps<"/catering/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const order = getCateringOrder(id, user.storeId);
  if (!order) notFound();

  const last = lastUpdatedBy("catering_order", id) as { actor_name: string | null; created_at: string } | undefined;
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(user.storeId, iso, locale);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref={resolveBackHref(sp.from, "/more/catering")} lang={user.language} title={t(user.language, "catering_title")} />
      <p className="mt-2 text-xs text-muted">{fmt(order.created_at)}</p>

      <div className="mt-4">
        <CateringOrderRow order={order} lang={user.language} />
      </div>

      {last && (
        <p className="mt-3 text-xs text-muted">
          {t(user.language, "field_last_updated_by")}: {last.actor_name || "system"} · {fmt(last.created_at)}
        </p>
      )}

      <ActivityLog entityType="catering_order" entityId={id} storeId={user.storeId} lang={user.language} />
    </div>
  );
}
