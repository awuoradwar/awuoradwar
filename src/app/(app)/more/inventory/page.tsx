import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInventoryItems } from "@/lib/services/inventoryService";
import { getMaintenanceItems, getMaintenanceHistory } from "@/lib/services/maintenanceService";
import { canDo } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import InventoryItemRow from "@/components/InventoryItemRow";
import AddInventoryItemForm from "@/components/AddInventoryItemForm";
import MaintenanceItemRow from "@/components/MaintenanceItemRow";
import AddMaintenanceItemForm from "@/components/AddMaintenanceItemForm";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const es = user.language === "es";
  const canManage = canDo(user, "inventory.manage");

  const items = getInventoryItems(user.storeId);
  const maintenanceItems = getMaintenanceItems(user.storeId);
  const historyByItem = Object.fromEntries(maintenanceItems.map((m) => [m.id, getMaintenanceHistory(m.id)]));

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={es ? "Inventario y Mantenimiento" : "Inventory & Maintenance"} />

      <section className="mb-8">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Suministros y Equipo" : "Supplies & Equipment"}
        </h2>
        <p className="mb-2 text-[11px] text-muted">
          {es
            ? "Cualquier gerente puede marcar algo como bajo o pedido durante su turno."
            : "Any manager can flag something as low or ordered during their shift."}
        </p>
        {items.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted">
            {es ? "Sin artículos todavía." : "No items yet."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {items.map((it) => (
              <InventoryItemRow key={it.id} item={it} lang={user.language} canManage={canManage} />
            ))}
          </div>
        )}
        {canManage && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-accent">
              {es ? "+ Agregar artículo" : "+ Add item"}
            </summary>
            <div className="mt-2">
              <AddInventoryItemForm lang={user.language} />
            </div>
          </details>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Mantenimiento" : "Maintenance"}
        </h2>
        <p className="mb-2 text-[11px] text-muted">
          {es
            ? "Filtros de agua, focos y otros artículos que se cambian periódicamente. Toca para ver el historial."
            : "Water filters, bulbs, and other items that get switched periodically. Tap to see history."}
        </p>
        {maintenanceItems.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted">
            {es ? "Sin artículos de mantenimiento todavía." : "No maintenance items yet."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {maintenanceItems.map((it) => (
              <MaintenanceItemRow key={it.id} item={it} history={historyByItem[it.id] || []} lang={user.language} canManage={canManage} />
            ))}
          </div>
        )}
        {canManage && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-accent">
              {es ? "+ Agregar artículo de mantenimiento" : "+ Add maintenance item"}
            </summary>
            <div className="mt-2">
              <AddMaintenanceItemForm lang={user.language} />
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
