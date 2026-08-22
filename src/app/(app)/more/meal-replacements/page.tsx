import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getOpenMealReplacements, getMealReplacementHistory, MealReplacementRow as MealReplacementRowData } from "@/lib/services/guestRecoveryService";
import MealReplacementRow from "@/components/MealReplacementRow";
import HistoryByWeek from "@/components/HistoryByWeek";
import PageHeader from "@/components/PageHeader";
import { Language } from "@/lib/types";

function OpenSection({
  title,
  sub,
  rows,
  lang,
  storeId,
}: {
  title: string;
  sub?: string;
  rows: MealReplacementRowData[];
  lang: Language;
  storeId: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{title}</h2>
        {rows.length > 0 && <span className="text-xs font-semibold text-muted">{rows.length}</span>}
      </div>
      {sub && <p className="mb-2 text-xs text-muted">{sub}</p>}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
          {lang === "es" ? "Todo en orden." : "All clear."}
        </p>
      ) : (
        <div className="card divide-y divide-border">
          {rows.map((r) => (
            <MealReplacementRow key={r.id} item={r} lang={lang} storeId={storeId} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function MealReplacementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;
  const open = getOpenMealReplacements(user.storeId);
  const history = getMealReplacementHistory(user.storeId);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/more" lang={lang} title={lang === "es" ? "Reemplazos de Comida" : "Meal Replacements"} />

      <Link
        href="/add/meal-replacement"
        className="tap-target flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar reemplazo de comida" : "+ Add meal replacement"}
      </Link>

      <OpenSection
        title={lang === "es" ? "Esperando Cumplimiento" : "Awaiting Fulfillment"}
        sub={
          lang === "es"
            ? "Reportado pero aún no entregado -- cualquier gerente puede completarlo cuando el cliente llegue"
            : "Reported but not yet given to the guest -- any manager can complete it whenever they show up"
        }
        rows={open}
        lang={lang}
        storeId={user.storeId}
      />

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-accent">{lang === "es" ? "Historial" : "History"}</span>
          <span className="shrink-0 text-xs font-semibold text-muted">{history.length}</span>
        </summary>
        <HistoryByWeek
          items={history}
          getDate={(item) => item.completed_at}
          keyOf={(item) => item.id}
          renderItem={(item) => <MealReplacementRow item={item} lang={lang} storeId={user.storeId} />}
          lang={lang}
          emptyLabel={lang === "es" ? "Ninguno todavía." : "None yet."}
        />
      </details>
    </div>
  );
}
