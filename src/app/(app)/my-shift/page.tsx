import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyShiftTasks, getCompletedTasksToday, computeSection, isBlocked, Section, windowForHour } from "@/lib/services/taskService";
import { getTodayShift } from "@/lib/services/shiftService";
import { getShiftTypeForUserToday } from "@/lib/services/scheduleService";
import { buildLiveSummary } from "@/lib/services/handoffService";
import { getCompletedThisShiftCount } from "@/lib/services/reportsService";
import { getCleaningTasksDueToday } from "@/lib/services/cleaningService";
import { getCateringDueOn } from "@/lib/services/cateringService";
import { storeToday, storeLocalHour, formatStoreDateTime } from "@/lib/storeTime";
import { getDb } from "@/lib/db";
import { buildManagerColorMap } from "@/lib/managerColor";
import { attendanceTypeLabel } from "@/lib/attendanceLabels";
import TaskCard from "@/components/TaskCard";
import CompactTaskRow from "@/components/CompactTaskRow";
import CompletedTaskRow from "@/components/CompletedTaskRow";
import CleaningTaskRow from "@/components/CleaningTaskRow";
import CateringOrderRow from "@/components/CateringOrderRow";
import { t } from "@/lib/i18n";

const OPEN_ITEM_HREF: Record<string, string> = {
  guest_recovery: "/guest-recovery",
  issue: "/issue",
  borrowed_item: "/borrowed-item",
};

const WEEKDAY_LABEL: Record<number, { en: string; es: string }> = {
  0: { en: "Sunday", es: "Domingo" },
  1: { en: "Monday", es: "Lunes" },
  2: { en: "Tuesday", es: "Martes" },
  3: { en: "Wednesday", es: "Miércoles" },
  4: { en: "Thursday", es: "Jueves" },
  5: { en: "Friday", es: "Viernes" },
  6: { en: "Saturday", es: "Sábado" },
};

/** "This Week" spans 7 days of recurring + one-off work with no grouping,
 * so every task -- however different its actual due day -- reads as one
 * undifferentiated list ("10:00 AM", "11:00 AM" ... with no day attached).
 * Groups by scheduled_date (a plain YYYY-MM-DD, no time component, so no
 * timezone conversion needed) and orders the groups chronologically. */
function dayLabel(dateStr: string, lang: "en" | "es"): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const weekday = WEEKDAY_LABEL[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()][lang];
  return `${weekday} · ${mo}/${d}`;
}

function groupByScheduledDate<T extends { scheduled_date: string | null }>(tasks: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = task.scheduled_date || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

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

  const tasks = getMyShiftTasks(user.storeId, today);
  // Same roster + palette as Week page's manager-capacity colors -- a
  // manager's dot is the same color everywhere they show up as an owner.
  const managerIds = (
    getDb().prepare(`SELECT id FROM users WHERE active = 1 AND position != 'ASSOCIATE'`).all() as Array<{ id: string }>
  ).map((m) => m.id);
  const managerColors = Object.fromEntries(buildManagerColorMap(managerIds));

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
  const cateringToday = getCateringDueOn(user.storeId, today);
  // A call-in/late/no-show -- or an issue, borrowed item, or meal
  // replacement -- logged during the shift that's happening right now is
  // current information for whoever's on now, not a leftover from a prior
  // shift. Only items actually opened in the immediately preceding shift
  // window belong under "From Last Shift" -- matching by hour-of-day alone
  // (the old check) ignores the calendar date entirely, so a borrowed item
  // or maintenance-flavored issue that's been open for days (waiting on a
  // technician, say) would match "this shift" or "last shift" every single
  // day forever, as long as it happened to be opened in a window that lines
  // up with the current one. Anything older than the immediately preceding
  // shift simply isn't shown here at all -- it's still fully visible on its
  // own page (Work Orders, Borrowed Items), which is where day-spanning
  // open items belong long-term.
  const nowWindow = windowForHour(storeLocalHour(user.storeId, now));
  const yesterday = storeToday(user.storeId, new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const shiftBucketOf = (createdAt: string): "current" | "prior" | "older" => {
    const d = new Date(createdAt);
    const itemDate = storeToday(user.storeId, d);
    const itemWindow = windowForHour(storeLocalHour(user.storeId, d));
    if (itemDate === today && itemWindow === nowWindow) return "current";
    const isImmediatelyPriorShift =
      nowWindow === "MORNING" ? itemDate === yesterday && itemWindow === "EVENING" : itemDate === today && itemWindow === "MORNING";
    return isImmediatelyPriorShift ? "prior" : "older";
  };
  const currentShiftStaffing = summary.staffing.filter((s) => shiftBucketOf(s.created_at) === "current");
  const priorShiftStaffing = summary.staffing.filter((s) => shiftBucketOf(s.created_at) === "prior");
  // Meal replacements have no known fulfillment time -- unlike an issue or
  // borrowed item, there's nothing time-bound to surface here, so they stay
  // off My Shift entirely and live only on their own dedicated list
  // (More > Meal Replacements).
  const openItemsForMyShift = summary.openItems.filter((it) => it.kind !== "guest_recovery");
  // A day-spanning open item that's still just quietly pending (waiting on
  // a technician, say) correctly ages out per the comment above -- but one
  // that's now actually critical (a CRITICAL issue, or a borrowed/lent item
  // past its due date) needs to keep surfacing for whoever's on shift right
  // now regardless of how old it is, same reasoning as CRITICAL tasks
  // always escalating to NOW.
  const currentShiftOpenItems = openItemsForMyShift.filter((it) => {
    const bucket = shiftBucketOf(it.created_at);
    return bucket === "current" || (bucket === "older" && it.critical);
  });
  const priorShiftOpenItems = openItemsForMyShift.filter((it) => shiftBucketOf(it.created_at) === "prior");
  const fromLastShiftCount = priorShiftStaffing.length + priorShiftOpenItems.length + unresolvedForDisplay.length;
  // Catering folds into This Shift rather than getting its own top-level
  // card -- a store sees maybe 1-3 orders a shift, not enough volume to
  // earn a standalone section without crowding the home page.
  const currentShiftCount = currentShiftStaffing.length + currentShiftOpenItems.length + cateringToday.length;

  const locale = user.language === "es" ? "es-MX" : "en-US";
  const dateLabel = formatStoreDateTime(user.storeId, now.toISOString(), locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const completedThisShift = getCompletedThisShiftCount(user.storeId, user.id, today);
  const completedToday = getCompletedTasksToday(user.storeId, today);
  // TaskCard/CompactTaskRow are client components and can't call
  // formatStoreDateTime themselves (server-only) -- computed here instead
  // of letting them fall back to `new Date(...).toLocaleTimeString()`,
  // which renders in the server process's own timezone (UTC in
  // production), not the store's, silently showing the wrong due time.
  const dueLabelFor = (dueAt: string | null) => (dueAt ? formatStoreDateTime(user.storeId, dueAt, locale, { hour: "numeric", minute: "2-digit" }) : null);

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

      {currentShiftCount > 0 && (
        <SectionCard
          title={user.language === "es" ? "Este Turno" : "This Shift"}
          sub={user.language === "es" ? "Personal, catering, problemas y artículos abiertos en este turno" : "Staffing, catering, issues, and items opened this shift"}
          count={currentShiftCount}
        >
          <div className="flex flex-col gap-2">
            {cateringToday.map((order) => (
              <CateringOrderRow key={order.id} order={order} lang={user.language} />
            ))}
            {currentShiftStaffing.map((s) => (
              <Link key={s.id} href={`/attendance/${s.id}`} className="card block p-3 text-sm">
                🧍 {s.employee_name} — {attendanceTypeLabel(s.type, user.language)}
                {s.note ? <span className="text-muted"> · {s.note}</span> : null}
              </Link>
            ))}
            {currentShiftOpenItems.map((it, i) => (
              <Link
                key={`current-open-${i}`}
                href={`${OPEN_ITEM_HREF[it.kind]}/${it.id}`}
                className={`card block p-3 text-sm ${it.critical ? "border-critical/40" : ""}`}
              >
                {it.critical ? "🔴" : it.kind === "guest_recovery" ? "🍽️" : it.kind === "issue" ? "⚠️" : "📦"} {it.title}
                {it.critical && (
                  <span className="ml-1.5 font-semibold text-critical">
                    {it.kind === "borrowed_item" ? (user.language === "es" ? "· Vencido" : "· Overdue") : ""}
                  </span>
                )}
              </Link>
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
                <TaskCard key={task.id} lang={user.language} task={{ ...task, blocked: isBlocked(task), dueLabel: dueLabelFor(task.due_at) }} managerColors={managerColors} />
              ))}
            </div>
          )}
        </SectionCard>
      ))}

      <SectionCard
        title={user.language === "es" ? "Limpieza de Hoy" : "Cleaning Today"}
        sub={user.language === "es" ? "Tareas de limpieza de hoy, incluyendo las completadas" : "Today's cleaning tasks, including completed ones"}
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
            <div className="border-t border-border">
              {groupByScheduledDate(buckets[bucket]).map(([dateStr, dayTasks]) => (
                <div key={dateStr || "no-date"}>
                  <p className="border-b border-border bg-card-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {dateStr ? dayLabel(dateStr, user.language) : user.language === "es" ? "Sin fecha" : "No date"}
                  </p>
                  <div className="divide-y divide-border">
                    {dayTasks.map((task) => (
                      <CompactTaskRow key={task.id} lang={user.language} task={{ ...task, blocked: isBlocked(task), dueLabel: dueLabelFor(task.due_at) }} managerColors={managerColors} />
                    ))}
                  </div>
                </div>
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
              <CompletedTaskRow key={task.id} lang={user.language} task={task} storeId={user.storeId} />
            ))}
          </div>
        )}
      </details>

      <SectionCard
        title={t(user.language, "section_from_last_shift" as never)}
        sub={t(user.language, "section_from_last_shift_sub" as never)}
        count={fromLastShiftCount}
      >
        {fromLastShiftCount === 0 ? (
          <p className="text-center text-xs text-muted">{t(user.language, "all_clear")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {priorShiftStaffing.map((s) => (
              <Link key={s.id} href={`/attendance/${s.id}`} className="card block p-3 text-sm">
                🧍 {s.employee_name} — {attendanceTypeLabel(s.type, user.language)}
                {s.note ? <span className="text-muted"> · {s.note}</span> : null}
              </Link>
            ))}
            {priorShiftOpenItems.map((it, i) => (
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
      </SectionCard>
    </div>
  );
}
