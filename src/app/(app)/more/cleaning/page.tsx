import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getAreasWithProgress, ensureWeeklyCleaningRotation } from "@/lib/services/cleaningService";
import CleaningTaskRow from "@/components/CleaningTaskRow";
import BulkAddCleaningForm from "@/components/BulkAddCleaningForm";
import LoadRotationButton from "@/components/LoadRotationButton";
import PageHeader from "@/components/PageHeader";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";
import { storeToday } from "@/lib/storeTime";

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
}

interface CleaningArea {
  id: string;
  name: string;
  name_es: string | null;
  category: string;
  owner_name: string | null;
  tasks: CleaningTask[];
}

function FrequencySection({ title, areas, lang }: { title: string; areas: CleaningArea[]; lang: Language }) {
  const nonEmpty = areas.filter((a) => a.tasks.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">{title}</h2>
      <div className="flex flex-col gap-5">
        {nonEmpty.map((area) => {
          const done = area.tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
          return (
            <div key={area.id}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{lang === "es" && area.name_es ? area.name_es : area.name}</h3>
                <span className="text-xs text-muted">
                  {done}/{area.tasks.length} · {area.owner_name || "—"}
                </span>
              </div>
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full bg-ok" style={{ width: `${area.tasks.length ? (done / area.tasks.length) * 100 : 0}%` }} />
              </div>
              <div className="flex flex-col gap-2">
                {area.tasks.map((ct) => (
                  <CleaningTaskRow key={ct.id} task={ct} lang={lang} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function CleaningPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  ensureWeeklyCleaningRotation(user.storeId, user);
  const areas = getAreasWithProgress(user.storeId) as CleaningArea[];
  const dailyAreas = areas.map((a) => ({ ...a, tasks: a.tasks.filter((t) => t.frequency === "DAILY") }));
  // Weekly tasks tied to a specific weekday (the deep-clean rotation) only show up
  // on their day -- same "today's version of the schedule shows itself" principle
  // as the recurring task engine. Weekly tasks with no fixed day stay visible all week.
  const todayWeekday = new Date(storeToday(user.storeId) + "T00:00:00Z").getDay();
  const weeklyAreas = areas.map((a) => ({
    ...a,
    tasks: a.tasks.filter((t) => t.frequency === "WEEKLY" && (t.weekday == null || t.weekday === todayWeekday)),
  }));

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

      <FrequencySection title={t(user.language, "cleaning_daily")} areas={dailyAreas} lang={user.language} />
      <FrequencySection title={t(user.language, "cleaning_weekly")} areas={weeklyAreas} lang={user.language} />
    </div>
  );
}
