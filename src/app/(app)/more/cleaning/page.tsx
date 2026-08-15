import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getAreasWithProgress } from "@/lib/services/cleaningService";
import CleaningTaskRow from "@/components/CleaningTaskRow";

export default async function CleaningPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const areas = getAreasWithProgress(user.storeId);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <Link href="/more" className="mb-3 inline-block text-sm text-muted">
        ← {user.language === "es" ? "Atrás" : "Back"}
      </Link>
      <h1 className="mb-4 text-lg font-semibold">{user.language === "es" ? "Limpieza" : "Cleaning"}</h1>
      <div className="flex flex-col gap-5">
        {areas.map((area) => (
          <section key={area.id}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{area.name}</h2>
              <span className="text-xs text-muted">
                {area.done}/{area.total} · {area.owner_name || "—"}
              </span>
            </div>
            <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-ok" style={{ width: `${area.total ? (area.done / area.total) * 100 : 0}%` }} />
            </div>
            <div className="flex flex-col gap-2">
              {area.tasks.map((ct) => (
                <CleaningTaskRow key={ct.id} task={ct} lang={user.language} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
