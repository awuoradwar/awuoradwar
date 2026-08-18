import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOpenTasksForStore, getCompletedTasksToday, computeSection, isBlocked, Section, windowForHour } from "@/lib/services/taskService";
import { getTodayShift } from "@/lib/services/shiftService";
import { getShiftTypeForUserToday } from "@/lib/services/scheduleService";
import { buildLiveSummary } from "@/lib/services/handoffService";
import { getCompletedThisShiftCount } from "@/lib/services/reportsService";
import { getCleaningTasksDueToday } from "@/lib/services/cleaningService";
import { storeToday, storeLocalHour } from "@/lib/storeTime";
import TaskCard from "@/components/TaskCard";
import CompactTaskRow from "@/components/CompactTaskRow";
import CompletedTaskRow from "@/components/CompletedTaskRow";
import CleaningTaskRow from "@/components/CleaningTaskRow";
import { t } from "@/lib/i18n";

const OPEN_ITEM_HREF: Record<string, string> = {
  guest_recovery: "/guest-recovery",
  issue: "/issue",
  borrowed_item: "/borrowed-item",
};

/** Every My Shift section lives inside the same bordered card, header and
 * content together -- matching how This Week/Completed already look, so a
 * section doesn't visually change containers depending on whether it's
 * collapsible. */
function SectionCard({
  title,
  sub,
  count,
  children,
}: {
  title: string;
  sub: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wide text-accent">{title}</h2>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        {!!count && <span className="shrink-0 text-xs font-semibold text-muted">{count}</span>}
      </div>
      <div className="border-t border-border p-3">{children}</div>
    </section>
  );
}

export default async function MyShiftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const today = storeToday(user.storeId, now);
  const todayShift = getTodayShift(user.storeId, today);
  const viewerShiftType = getShiftTypeForUserToday(user.storeId, user.id, today);

  const tasks = getOpenTasksForStore(user.storeId);
  const buckets: Record<Section, typeof tasks> = { NOW: [], TODAY: [], THIS_WEEK: [] };
  for (const task of tasks) {
    buckets[computeSection(task, user.id, todayShift?.pic_user_id ?? null, now, today, viewerShiftType)].push(task);
  }

  const summary = buildLiveSummary(user.storeId, user.language);
  // Tasks are excluded from "from last shift" since MY SHIFT/TODAY above
  // already cover every open task, and cleaning gets its own actionable
  // section below instead of the flat unresolved list. What's left
  // (acknowledgements) is genuinely handoff-relevant: something outstanding
  // from a prior shift.
  const unresolvedForDisplay = summary.unresolved.filter((u) => u.kind !== "task" && u.kind !== "cleaning");
  const todayWeekday = new Date(today + "T00:00:00Z").getDay();
  const cleaningToday = getCleaningTasksDueToday(user.storeId, todayWeekday);
  // A call-in/late/no-show logged during the shift that's happening right
  // now is current information for whoever's on now, not a leftover from a
  // prior shift -- only staffing events logged in an earlier shift window
  // belong under "From Last Shift".
  const nowWindow = windowForHour(storeLocalHour(user.storeId, now));
  const currentShiftStaffing = summary.staffing.filter((s) => windowForHour(storeLocalHour(user.storeId, new Date(s.created_at))) === nowWindow);
  const priorShiftStaffing = summary.staffing.filter((s) => windowForHour(storeLocalHour(user.storeId, new Date(s.created_at))) !== nowWindow);
  const fromLastShiftCount = priorShiftStaffing.length + summary.openItems.length + unresolvedForDisplay.length;

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

      {currentShiftStaffing.length > 0 && (
        <SectionCard
          title={user.language === "es" ? "Personal de Este Turno" : "Staffing This Shift"}
          sub={user.language === "es" ? "Llamadas, tardanzas y cobertura de hoy" : "Call-ins, late arrivals, and coverage happening now"}
          count={currentShiftStaffing.length}
        >
          <div className="flex flex-col gap-2">
            {currentShiftStaffing.map((s, i) => (
              <div key={`current-staff-${i}`} className="card p-3 text-sm">
                🧍 {s.employee_name} — {s.type.replace("_", " ")}
                {s.note ? <span className="text-muted"> · {s.note}</span> : null}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {(["NOW", "TODAY"] as const).map((bucket) => (
        <SectionCard
          key={bucket}
          title={t(user.language, `section_${bucket.toLowerCase()}` as never)}
          sub={t(user.language, `section_${bucket.toLowerCase()}_sub` as never)}
          count={buckets[bucket].length}
        >
          {buckets[bucket].length === 0 ? (
            <p className="text-center text-xs text-muted">{t(user.language, "all_clear")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {buckets[bucket].map((task) => (
                <TaskCard key={task.id} lang={user.language} task={{ ...task, blocked: isBlocked(task) }} />
              ))}
            </div>
          )}
        </SectionCard>
      ))}

      <SectionCard
        title={user.language === "es" ? "Limpieza de Hoy" : "Cleaning Today"}
        sub={user.language === "es" ? "Tareas de limpieza pendientes de hoy" : "Today's outstanding cleaning tasks"}
        count={cleaningToday.length}
      >
        {cleaningToday.length === 0 ? (
          <p className="text-center text-xs text-muted">{t(user.language, "all_clear")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cleaningToday.map((ct) => (
              <div key={ct.id}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {user.language === "es" && ct.area_name_es ? ct.area_name_es : ct.area_name}
                  {ct.owner_name ? ` · ${ct.owner_name}` : ""}
                </p>
                <CleaningTaskRow task={ct} lang={user.language} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {(["THIS_WEEK"] as const).map((bucket) => (
        <details key={bucket} className="card overflow-hidden" open={false}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide text-accent">
                {t(user.language, `section_${bucket.toLowerCase()}` as never)}
              </span>
              <p className="text-xs text-muted">{t(user.language, `section_${bucket.toLowerCase()}_sub` as never)}</p>
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
            <p className="text-xs text-muted">{t(user.language, "section_completed_sub")}</p>
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
        <p className="mb-2 text-xs text-muted">{t(user.language, "section_from_last_shift_sub" as never)}</p>
        {fromLastShiftCount === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
            {t(user.language, "all_clear")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {priorShiftStaffing.map((s, i) => (
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
            {unresolvedForDisplay.map((u, i) => (
              <Link key={`unres-${i}`} href="/more/acknowledgements" className="card block p-3 text-sm transition-colors hover:border-accent/40">
                📋 {u.title}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
