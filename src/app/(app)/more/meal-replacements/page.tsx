import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMealReplacementsGrouped, MealReplacementRow as MealReplacementRowData } from "@/lib/services/guestRecoveryService";
import MealReplacementRow from "@/components/MealReplacementRow";
import PageHeader from "@/components/PageHeader";
import { Language } from "@/lib/types";

function Section({
  title,
  sub,
  rows,
  lang,
  collapsible,
}: {
  title: string;
  sub?: string;
  rows: MealReplacementRowData[];
  lang: Language;
  collapsible?: boolean;
}) {
  const body =
    rows.length === 0 ? (
      <p
        className={
          collapsible
            ? "border-t border-border p-4 text-center text-xs text-muted"
            : "rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted"
        }
      >
        {lang === "es" ? "Todo en orden." : "All clear."}
      </p>
    ) : (
      <div className={collapsible ? "divide-y divide-border border-t border-border" : "card divide-y divide-border"}>
        {rows.map((r) => (
          <MealReplacementRow key={r.id} item={r} lang={lang} />
        ))}
      </div>
    );

  if (collapsible) {
    return (
      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{title}</span>
            {sub && <p className="text-[11px] text-muted">{sub}</p>}
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted">{rows.length}</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{title}</h2>
        {rows.length > 0 && <span className="text-xs font-semibold text-muted">{rows.length}</span>}
      </div>
      {sub && <p className="mb-2 text-[11px] text-muted">{sub}</p>}
      {body}
    </section>
  );
}

export default async function MealReplacementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;
  const today = new Date().toISOString().slice(0, 10);
  const { open, completedToday } = getMealReplacementsGrouped(user.storeId, today);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <PageHeader backHref="/more" lang={lang} title={lang === "es" ? "Reemplazos de Comida" : "Meal Replacements"} />

      <Section
        title={lang === "es" ? "Esperando Cumplimiento" : "Awaiting Fulfillment"}
        sub={
          lang === "es"
            ? "Reportado pero aún no entregado -- cualquier gerente puede completarlo cuando el cliente llegue"
            : "Reported but not yet given to the guest -- any manager can complete it whenever they show up"
        }
        rows={open}
        lang={lang}
      />
      <Section title={lang === "es" ? "Completados Hoy" : "Completed Today"} rows={completedToday} lang={lang} collapsible />
    </div>
  );
}
