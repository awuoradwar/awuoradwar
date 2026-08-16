import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOpenTasksForStore, getCompletedTasksToday, computeSection, isBlocked, Section, getChecklistSummaries } from "@/lib/services/taskService";
import { getTodayShift } from "@/lib/services/shiftService";
import { buildLiveSummary } from "@/lib/services/handoffService";
import { getCompletedThisShiftCount } from "@/lib/services/reportsService";
import TaskCard from "@/components/TaskCard";
import CompactTaskRow from "@/components/CompactTaskRow";
import CompletedTaskRow from "@/components/CompletedTaskRow";
import { t } from "@/lib/i18n";

const OPEN_ITEM_HREF: Record<string, string> = {
  guest_recovery: "/guest-recovery",
  issue: "/issue",
  borrowed_item: "/borrowed-item",
};

export default async function MyShiftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayShift = getTodayShift(user.storeId, today);

  const tasks = getOpenTasksForStore(user.storeId);
  const buckets: Record<Section, typeof tasks> = { NOW: [], TODAY: [], THIS_WEEK: [] };
  for (const task of tasks) {
    buckets[computeSection(task, user.id, todayShift?.pic_user_id ?? null, now, today)].push(task);
  }

  const checklists = getChecklistSummaries(user.storeId, today);
  const summary = buildLiveSummary(user.storeId, user.language);
  const fromLastShiftCount =
    summary.staffing.length + summary.openItems.length +
    summary.unresolved.filter((u) => u.kind !== "task").length;

  const dateLabel = now.toLocaleDateString(user.language === "es" ? "es-MX" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const completedThisShift = getCompletedThisShiftCount(user.storeId, user.id, today);
  const completedToday = getCompletedTasksToday(user.storeId, today);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted">{dateLabel}</p>
        {completedThisShift > 0 && (
          <a href="#completed" className="text-xs font-medium text-ok transition-opacity hover:opacity-75">
            ✓ {completedThisShift} {t(user.language, "completed_this_shift")}
          </a>
        )}
      </div>

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

      {(["NOW", "TODAY"] as const).map((bucket) => (
        <section key={bucket}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, `section_${bucket.toLowerCase()}` as never)}</h2>
            {buckets[bucket].length > 0 && <span className="text-xs font-semibold text-muted">{buckets[bucket].length}</span>}
          </div>
          <p className="mb-2 text-[11px] text-muted">{t(user.language, `section_${bucket.toLowerCase()}_sub` as never)}</p>
          {buckets[bucket].length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
              {t(user.language, "all_clear")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {buckets[bucket].map((task) => (
                <TaskCard key={task.id} lang={user.language} task={{ ...task, blocked: isBlocked(task) }} />
              ))}
            </div>
          )}
        </section>
      ))}

      {(["THIS_WEEK"] as const).map((bucket) => (
        <details key={bucket} className="card overflow-hidden" open={false}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide text-accent">
                {t(user.language, `section_${bucket.toLowerCase()}` as never)}
              </span>
              <p className="text-[11px] text-muted">{t(user.language, `section_${bucket.toLowerCase()}_sub` as never)}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted">{buckets[bucket].length}</span>
          </summary>
          {buckets[bucket].length === 0 ? (
            <p className="border-t border-border p-4 text-center text-xs text-muted">{t(user.language, "all_clear")}</p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {buckets[bucket].map((task) => (
                <CompactTaskRow key={task.id} lang={user.language} task={{ ...task, blocked: isBlocked(task) }} />
              ))}
            </div>
          )}
        </details>
      ))}

      <details id="completed" className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-accent">{t(user.language, "section_completed")}</span>
            <p className="text-[11px] text-muted">{t(user.language, "section_completed_sub")}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted">{completedToday.length}</span>
        </summary>
        {completedToday.length === 0 ? (
          <p className="border-t border-border p-4 text-center text-xs text-muted">{t(user.language, "all_clear")}</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {completedToday.map((task) => (
              <CompletedTaskRow key={task.id} lang={user.language} task={task} />
            ))}
          </div>
        )}
      </details>

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
