import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAreasWithProgress, ensureWeeklyCleaningRotation } from "@/lib/services/cleaningService";
import CleaningTaskRow from "@/components/CleaningTaskRow";
import BulkAddCleaningForm from "@/components/BulkAddCleaningForm";
import LoadRotationButton from "@/components/LoadRotationButton";
import AssignAreaOwnerControl from "@/components/AssignAreaOwnerControl";
import PageHeader from "@/components/PageHeader";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/types";

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

function AreaBlock({ area, managers, lang }: { area: CleaningArea; managers: Array<{ id: string; name: string }>; lang: Language }) {
  const done = area.tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{lang === "es" && area.name_es ? area.name_es : area.name}</h3>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span>
            {done}/{area.tasks.length}
          </span>
          <AssignAreaOwnerControl areaId={area.id} ownerId={area.owner_id} managers={managers} lang={lang} />
        </div>
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

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">{title}</h2>
      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => (
          <div key={cat}>
            <div className="mb-3 flex items-center gap-2 border-b-2 border-accent/20 pb-1.5">
              <span aria-hidden>{CATEGORY_ICON[cat]}</span>
              <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{CATEGORY_LABEL[cat][lang]}</h3>
            </div>
            <div className="flex flex-col gap-5">
              {byCategory.get(cat)!.map((area) => (
                <AreaBlock key={area.id} area={area} managers={managers} lang={lang} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
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
    </div>
  );
}
