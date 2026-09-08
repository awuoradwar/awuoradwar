import {
  getStoreByProceduresToken,
  listActiveAreas,
  listItemsForArea,
  ProcedureCategory,
  ProcedureShiftType,
} from "@/lib/services/procedureService";
import ProcedureKiosk from "@/components/ProcedureKiosk";

const CATEGORY_ORDER: ProcedureCategory[] = ["FOH", "BOH", "PATIO_WINDOWS"];

export default async function PublicProceduresPage({ params }: PageProps<"/procedures/[token]">) {
  const { token } = await params;
  const store = getStoreByProceduresToken(token);

  if (!store) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-muted">Ask a manager for the current link or QR code.</p>
      </div>
    );
  }

  const areas = listActiveAreas(store.id);
  const itemsByAreaShift: Record<string, ReturnType<typeof listItemsForArea>> = {};
  for (const area of areas) {
    for (const shiftType of ["OPENING", "CLOSING"] as ProcedureShiftType[]) {
      itemsByAreaShift[`${area.id}:${shiftType}`] = listItemsForArea(area.id, shiftType);
    }
  }
  // Only offer a category that actually has a station set up under it --
  // Back of House and Patio & Windows aren't built out yet, so they'd only
  // ever lead to a dead-end "no areas set up" screen.
  const categories = CATEGORY_ORDER.filter((c) => areas.some((a) => a.category === c));

  return <ProcedureKiosk token={token} storeName={store.name} areas={areas} itemsByAreaShift={itemsByAreaShift} categories={categories} />;
}
