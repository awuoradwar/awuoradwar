import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getAreasWithProgress,
  ensureWeeklyCleaningRotation,
  getWeeklyCleaningHistory,
  getWeeklyCleaningCompletionRate,
  CleaningHistoryEntry,
} from "@/lib/services/cleaningService";
import CleaningTaskRow from "@/components/CleaningTaskRow";
import BulkAddCleaningForm from "@/components/BulkAddCleaningForm";
import LoadRotationButton from "@/components/LoadRotationButton";
import AssignAreaOwnerControl from "@/components/AssignAreaOwnerControl";
import PageHeader from "@/components/PageHeader";
import HistoryByWeek from "@/components/HistoryByWeek";
import AttachmentViewerLink from "@/components/AttachmentViewerLink";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";
import { formatStoreDateTime } from "@/lib/storeTime";

interface ChecklistItem {
  id: string;
  text: string;
  associate_name: string | null;
  done: number;
}

interface CleaningTask {
  id: string;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
  frequency: "DAILY" | "WEEKLY";
  weekday: number | null;
  status: string;
  associate_name: string | null;
  photo_required: number;
  photo_before_url: string | null;
  photo_after_url: string | null;
  checklistItems: ChecklistItem[];
}

interface CleaningArea {
  id: string;
  name: string;
  name_es: string | null;
  category: string;
  owner_id: string | null;
  owner_name: string | null;
  tasks: CleaningTask[];
}

const CATEGORY_ORDER = ["FOH", "BOH", "FACILITIES"] as const;
const CATEGORY_LABEL: Record<string, Record<Language, string>> = {
  FOH: { en: "Front of House", es: "Frente de la Casa" },
  BOH: { en: "Back of House", es: "Parte Trasera" },
  FACILITIES: { en: "Facilities", es: "Instalaciones" },
};
const CATEGORY_ICON: Record<string, string> = { FOH: "🛎️", BOH: "🍳", FACILITIES: "🏢" };

/** Collapsed by default -- name, owner, and progress are all visible at a
 * glance in the summary, so a manager scanning the whole rotation doesn't
 * have to scroll past every single task's full detail (checklist, photos,
 * edit/delete) to see what's outstanding. Tapping in still gets the full
 * CleaningTaskRow list, unchanged. */
function AreaBlock({ area, managers, lang }: { area: CleaningArea; managers: Array<{ id: string; name: string }>; lang: Language }) {
  const done = area.tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted transition-transform group-open:rotate-90">▸</span>
            <h3 className="min-w-0 truncate text-sm font-semibold">{lang === "es" && area.name_es ? area.name_es : area.name}</h3>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full bg-ok" style={{ width: `${area.tasks.length ? (done / area.tasks.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span>
            {done}/{area.tasks.length}
          </span>
          <AssignAreaOwnerControl areaId={area.id} ownerId={area.owner_id} managers={managers} lang={lang} stopClickPropagation />
        </div>
      </summary>
      <div className="mt-2 flex flex-col gap-2 pl-4">
        {area.tasks.map((ct) => (
          <CleaningTaskRow key={ct.id} task={ct} lang={lang} />
        ))}
      </div>
    </details>
  );
}

function FrequencySection({
  title,
  areas,
  managers,
  lang,
}: {
  title: string;
  areas: CleaningArea[];
  managers: Array<{ id: string; name: string }>;
  lang: Language;
}) {
  const nonEmpty = areas.filter((a) => a.tasks.length > 0);
  if (nonEmpty.length === 0) return null;

  const byCategory = new Map<string, CleaningArea[]>();
  for (const area of nonEmpty) {
    const cat = CATEGORY_ORDER.includes(area.category as (typeof CATEGORY_ORDER)[number]) ? area.category : "FACILITIES";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(area);
  }
  // Order by due day (Sun..Sat), not alphabetically by area name, so the
  // weekly rotation reads the same order as the physical chart.
  const minWeekday = (area: CleaningArea) => Math.min(...area.tasks.map((t) => t.weekday ?? 7));
  for (const list of byCategory.values()) {
    list.sort((a, b) => minWeekday(a) - minWeekday(b));
  }

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">{title}</h2>
      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => (
          <details key={cat} open>
            <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 border-b-2 border-accent/20 pb-1.5">
              <span aria-hidden>{CATEGORY_ICON[cat]}</span>
              <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{CATEGORY_LABEL[cat][lang]}</h3>
            </summary>
            <div className="flex flex-col gap-5">
              {byCategory.get(cat)!.map((area) => (
                <AreaBlock key={area.id} area={area} managers={managers} lang={lang} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Completed/verified entries expand to the full checklist + photo snapshot
 * taken at that moment; a MISSED entry has nothing to expand into (nothing
 * was ever done), so it renders as a plain flagged row instead of a
 * <details>. Missed rows show in critical red -- everything else in the
 * normal reading color -- so a skipped week stands out while scanning. */
function HistoryRow({ entry, lang, locale, storeId }: { entry: CleaningHistoryEntry; lang: Language; locale: string; storeId: string }) {
  const title = lang === "es" && entry.title_es ? entry.title_es : entry.title;
  const area = lang === "es" && entry.area_name_es ? entry.area_name_es : entry.area_name;
  const missed = entry.action === "MISSED";
  const byLabel = entry.action === "VERIFIED" ? (lang === "es" ? "Verificado por" : "Verified by") : lang === "es" ? "Completado por" : "Completed by";
  const parts = [
    area,
    entry.associate_name ? `${lang === "es" ? "Asociado" : "Associate"}: ${entry.associate_name}` : null,
    !missed && entry.by_name ? `${byLabel}: ${entry.by_name}` : null,
  ].filter(Boolean);
  const dateLabel = formatStoreDateTime(storeId, entry.at, locale, { weekday: "short", month: "short", day: "numeric" });

  if (missed) {
    return (
      <div className="px-3 py-2 text-sm text-critical">
        <p className="truncate font-medium">
          ✕ {title} <span className="font-normal">· {lang === "es" ? "No completada" : "Not completed"}</span>
        </p>
        <p className="truncate text-xs text-critical/70">
          {dateLabel} · {area}
        </p>
      </div>
    );
  }

  const items = entry.snapshot.checklist_items;
  const hasDetail = items.length > 0 || entry.snapshot.photo_before_url || entry.snapshot.photo_after_url;

  return (
    <details className="px-3 py-2 text-sm">
      <summary className="cursor-pointer list-none">
        <p className="truncate">{title}</p>
        <p className="truncate text-xs text-muted">
          {dateLabel} · {parts.join(" · ")}
          {hasDetail && <span className="text-accent"> · {lang === "es" ? "Ver detalle" : "View detail"}</span>}
        </p>
      </summary>
      {hasDetail && (
        <div className="mt-2 border-t border-border pt-2">
          {items.length > 0 && (
            <ul className="flex flex-col gap-1">
              {items.map((item, i) => (
                <li key={i} className={`flex items-center gap-1.5 text-sm ${item.done ? "text-muted line-through" : ""}`}>
                  <span>{item.done ? "✓" : "○"}</span>
                  <span className="flex-1">{item.text}</span>
                  {item.associate_name && <span className="text-xs text-muted">{item.associate_name}</span>}
                </li>
              ))}
            </ul>
          )}
          {(entry.snapshot.photo_before_url || entry.snapshot.photo_after_url) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {entry.snapshot.photo_before_url && (
                <AttachmentViewerLink
                  href={`/api/cleaning-photos/history/${entry.id}?kind=before`}
                  label={t(lang, "cleaning_before_photo")}
                  lang={lang}
                  className="text-accent underline"
                />
              )}
              {entry.snapshot.photo_after_url && (
                <AttachmentViewerLink
                  href={`/api/cleaning-photos/history/${entry.id}?kind=after`}
                  label={t(lang, "cleaning_after_photo")}
                  lang={lang}
                  className="text-accent underline"
                />
              )}
            </div>
          )}
        </div>
      )}
    </details>
  );
}

export default async function CleaningPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  ensureWeeklyCleaningRotation(user.storeId, user);
  const areas = getAreasWithProgress(user.storeId) as CleaningArea[];
  const db = getDb();
  const managers = db
    .prepare(`SELECT id, name FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`)
    .all() as Array<{ id: string; name: string }>;
  const dailyAreas = areas.map((a) => ({ ...a, tasks: a.tasks.filter((t) => t.frequency === "DAILY") }));
  // This is the management/assignment view, so the whole week's rotation stays
  // visible here (each task already shows its own due weekday) so a manager can
  // review and assign ahead of time -- only My Shift's "what's due today" list
  // filters down to just today's weekday.
  const weeklyAreas = areas.map((a) => ({
    ...a,
    tasks: a.tasks.filter((t) => t.frequency === "WEEKLY"),
  }));
  const weeklyHistory = getWeeklyCleaningHistory(user.storeId);
  const completionRate = getWeeklyCleaningCompletionRate(user.storeId);
  const locale = user.language === "es" ? "es-MX" : "en-US";

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Limpieza" : "Cleaning"} />

      <Link
        href="/add/cleaning"
        className="tap-target mb-3 flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {user.language === "es" ? "+ Agregar tarea de limpieza" : "+ Add cleaning task"}
      </Link>

      <LoadRotationButton lang={user.language} />

      <BulkAddCleaningForm lang={user.language} existingAreas={areas.map((a) => a.name)} />

      <FrequencySection title={t(user.language, "cleaning_daily")} areas={dailyAreas} managers={managers} lang={user.language} />
      <FrequencySection title={t(user.language, "cleaning_weekly")} areas={weeklyAreas} managers={managers} lang={user.language} />

      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-accent">
              {user.language === "es" ? "Historial Semanal" : "Weekly History"}
            </span>
            <p className="text-xs text-muted">
              {user.language === "es"
                ? "El horario semanal se reinicia cada semana -- aquí queda el registro de lo ya hecho."
                : "The weekly chart resets each week -- this is the record of what's already been done."}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted">{weeklyHistory.length}</span>
        </summary>
        {completionRate.rate !== null && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <span className="text-muted">{user.language === "es" ? "Tasa de finalización (28 días)" : "Completion rate (28 days)"}</span>
            <span className={`font-semibold ${completionRate.rate >= 0.9 ? "text-ok" : completionRate.rate >= 0.7 ? "text-warning" : "text-critical"}`}>
              {Math.round(completionRate.rate * 100)}% ({completionRate.completed}/{completionRate.completed + completionRate.missed})
            </span>
          </div>
        )}
        <HistoryByWeek
          items={weeklyHistory}
          getDate={(item) => item.at}
          keyOf={(item) => item.id}
          storeId={user.storeId}
          renderItem={(item) => <HistoryRow entry={item} lang={user.language} locale={locale} storeId={user.storeId} />}
          lang={user.language}
          emptyLabel={user.language === "es" ? "Nada todavía." : "Nothing yet."}
        />
      </details>
    </div>
  );
}
