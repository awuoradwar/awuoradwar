import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { searchAll } from "@/lib/services/searchService";
import { formatStoreDateTime } from "@/lib/storeTime";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import FilterForm from "@/components/FilterForm";

const inputClass = "tap-target w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-accent";
const selectClass = inputClass;

const KIND_ICON: Record<string, string> = {
  task: "✅",
  issue: "⚠️",
  guest_recovery: "🍽️",
  borrowed_item: "📦",
  cleaning: "🧹",
  trainee: "🎓",
  catering: "🍱",
};

const KIND_HREF: Record<string, string> = {
  task: "/task",
  issue: "/issue",
  guest_recovery: "/guest-recovery",
  borrowed_item: "/borrowed-item",
  trainee: "/more/training",
  catering: "/catering",
};

const KIND_LABEL_EN: Record<string, string> = {
  task: "Task",
  issue: "Issue",
  guest_recovery: "Meal Replacement",
  borrowed_item: "Borrowed Item",
  cleaning: "Cleaning",
  trainee: "Training",
  catering: "Catering",
};
const KIND_LABEL_ES: Record<string, string> = {
  task: "Tarea",
  issue: "Problema",
  guest_recovery: "Reemplazo de Comida",
  borrowed_item: "Artículo Prestado",
  cleaning: "Limpieza",
  trainee: "Capacitación",
  catering: "Catering",
};

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "WAITING", "COMPLETE", "COMPLETED", "VERIFIED", "PENDING", "APPROVED", "RESOLVED", "SETTLED", "CANCELLED"];

export default async function SearchPage({ searchParams }: PageProps<"/more/search">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const q = (sp.q as string) || "";
  const kind = (sp.kind as string) || "";
  const status = (sp.status as string) || "";
  const start = (sp.start as string) || "";
  const end = (sp.end as string) || "";
  const hasFilter = !!(q.trim() || kind || status || start || end);
  const results = hasFilter ? searchAll(user.storeId, q.trim(), { kind: kind || undefined, status: status || undefined, startDate: start || undefined, endDate: end || undefined }) : [];
  const kindLabels = user.language === "es" ? KIND_LABEL_ES : KIND_LABEL_EN;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Buscar" : "Search"} />
      <FilterForm className="mb-4 flex flex-col gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder={user.language === "es" ? "Buscar tareas, problemas, clientes…" : "Search tasks, issues, recoveries…"}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" defaultValue={kind} className={selectClass}>
            <option value="">{user.language === "es" ? "Todo tipo" : "All types"}</option>
            {Object.keys(kindLabels).map((k) => (
              <option key={k} value={k}>
                {kindLabels[k]}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={selectClass}>
            <option value="">{user.language === "es" ? "Todo estado" : "All statuses"}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="start" defaultValue={start} className={inputClass} />
          <input type="date" name="end" defaultValue={end} className={inputClass} />
        </div>
        <button type="submit" className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover">
          {user.language === "es" ? "Buscar" : "Search"}
        </button>
      </FilterForm>
      {hasFilter && (
        <p className="mb-2 text-xs text-muted">
          {results.length} {user.language === "es" ? "resultados" : "results"}
        </p>
      )}
      <div className="card divide-y divide-border">
        {results.map((r) => {
          const href = KIND_HREF[r.kind];
          const row = (
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {KIND_ICON[r.kind] || "•"} {r.title}
                </p>
                <p className="text-xs text-muted">{formatStoreDateTime(user.storeId, r.date, "en-US", { dateStyle: "short" })}</p>
              </div>
              <StatusBadge status={r.status} lang={user.language} />
            </div>
          );
          return href ? (
            <Link key={`${r.kind}-${r.id}`} href={`${href}/${r.id}`} className="block">
              {row}
            </Link>
          ) : (
            <div key={`${r.kind}-${r.id}`}>{row}</div>
          );
        })}
      </div>
    </div>
  );
}
