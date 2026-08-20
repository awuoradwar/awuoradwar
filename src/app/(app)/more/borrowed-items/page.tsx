import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getOpenBorrowedItems, getSettledBorrowedItems } from "@/lib/services/borrowingService";
import BorrowedItemRow from "@/components/BorrowedItemRow";
import PageHeader from "@/components/PageHeader";

export default async function BorrowedItemsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const open = getOpenBorrowedItems(user.storeId);
  const settled = getSettledBorrowedItems(user.storeId);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/add" lang={lang} title={lang === "es" ? "Préstamos" : "Borrowed / Lent"} />

      <Link href="/add/borrowed-item" className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent">
        {lang === "es" ? "+ Agregar préstamo" : "+ Add borrowed/lent item"}
      </Link>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Abiertos" : "Open"}</h2>
          {open.length > 0 && <span className="text-xs font-semibold text-muted">{open.length}</span>}
        </div>
        <p className="mb-2 text-xs text-muted">
          {lang === "es" ? "Todo lo que sigue sin liquidar, sin importar cuánto tiempo lleve abierto" : "Everything still outstanding, however long it's been open"}
        </p>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
            {lang === "es" ? "Nada abierto." : "Nothing open."}
          </p>
        ) : (
          <div className="card divide-y divide-border">
            {open.map((item) => (
              <BorrowedItemRow key={item.id} item={item} lang={lang} storeId={user.storeId} />
            ))}
          </div>
        )}
      </section>

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Liquidados" : "Settled"}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{settled.length}</span>
        </summary>
        {settled.length === 0 ? (
          <p className="border-t border-border p-4 text-center text-xs text-muted">{lang === "es" ? "Ninguno todavía." : "None yet."}</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {settled.map((item) => (
              <BorrowedItemRow key={item.id} item={item} lang={lang} storeId={user.storeId} />
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
