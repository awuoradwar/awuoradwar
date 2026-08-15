import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOpenTasksForStore, computeBucket, isBlocked, Bucket, getChecklistSummaries } from "@/lib/services/taskService";
import { buildLiveSummary } from "@/lib/services/handoffService";
import TaskCard from "@/components/TaskCard";
import { t } from "@/lib/i18n";

const OPEN_ITEM_HREF: Record<string, string> = {
  guest_recovery: "/guest-recovery",
  issue: "/issue",
  borrowed_item: "/borrowed-item",
};

export default async function MyShiftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tasks = getOpenTasksForStore(user.storeId);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const buckets: Record<Bucket, typeof tasks> = { NOW: [], THIS_SHIFT: [], TODAY: [], THIS_WEEK: [] };
  for (const task of tasks) {
    const bucket = computeBucket(task, now, today);
    buckets[bucket].push(task);
  }

  const checklists = getChecklistSummaries(user.storeId, today);
  const summary = buildLiveSummary(user.storeId);
  const fromLastShiftCount =
    summary.staffing.length + summary.openItems.length +
    summary.unresolved.filter((u) => u.kind !== "task").length;

  const sections: { key: string; subKey: string; bucket: Bucket }[] = [
    { key: "section_now", subKey: "section_now_sub", bucket: "NOW" },
    { key: "section_this_shift", subKey: "section_this_shift_sub", bucket: "THIS_SHIFT" },
    { key: "section_today", subKey: "section_today_sub", bucket: "TODAY" },
    { key: "section_this_week", subKey: "section_this_week_sub", bucket: "THIS_WEEK" },
  ];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
      {(checklists.opening.total > 0 || checklists.closing.total > 0) && (
        <section className="flex flex-col gap-2">
          {checklists.opening.total > 0 && (
            <details className="card p-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                <span>{t(user.language, "checklist_opening_ready")}</span>
                <span className="text-xs font-normal text-muted">
                  {checklists.opening.done}/{checklists.opening.total}
                </span>
              </summary>
              {checklists.opening.remaining.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                  {checklists.opening.remaining.map((r) => (
                    <li key={r.id}>• {r.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted">{t(user.language, "all_clear")}</p>
              )}
            </details>
          )}
          {checklists.closing.total > 0 && (
            <details className="card p-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                <span>{t(user.language, "checklist_closing_complete")}</span>
                <span className="text-xs font-normal text-muted">
                  {checklists.closing.done}/{checklists.closing.total}
                </span>
              </summary>
              {checklists.closing.remaining.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                  {checklists.closing.remaining.map((r) => (
                    <li key={r.id}>• {r.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted">{t(user.language, "all_clear")}</p>
              )}
            </details>
          )}
        </section>
      )}

      {sections.map((s) => (
        <section key={s.bucket}>
          <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, s.key as never)}</h2>
          <p className="mb-2 text-[11px] text-muted">{t(user.language, s.subKey as never)}</p>
          {buckets[s.bucket].length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
              {t(user.language, "all_clear")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {buckets[s.bucket].map((task) => (
                <TaskCard
                  key={task.id}
                  lang={user.language}
                  task={{ ...task, blocked: isBlocked(task) }}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "section_from_last_shift" as never)}</h2>
        <p className="mb-2 text-[11px] text-muted">{t(user.language, "section_from_last_shift_sub" as never)}</p>
        {fromLastShiftCount === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
            {t(user.language, "all_clear")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {summary.staffing.map((s, i) => (
              <div key={`staff-${i}`} className="card p-3 text-sm">
                🧍 {s.employee_name} — {s.type.replace("_", " ")}
                {s.note ? <span className="text-muted"> · {s.note}</span> : null}
              </div>
            ))}
            {summary.openItems.map((it, i) => (
              <Link key={`open-${i}`} href={`${OPEN_ITEM_HREF[it.kind]}/${it.id}`} className="card block p-3 text-sm">
                {it.kind === "guest_recovery" ? "🍽️" : it.kind === "issue" ? "⚠️" : "📦"} {it.title}
              </Link>
            ))}
            {summary.unresolved.filter((u) => u.kind !== "task").map((u, i) => (
              <div key={`unres-${i}`} className="card p-3 text-sm">
                {u.kind === "cleaning" ? "🧹" : "📋"} {u.title}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
