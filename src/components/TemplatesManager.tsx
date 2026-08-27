import { getDb } from "@/lib/db";
import { canDo } from "@/lib/permissions";
import TemplateToggle from "@/components/TemplateToggle";
import TemplateForm from "@/components/TemplateForm";
import TemplateScheduleEditor from "@/components/TemplateScheduleEditor";
import TemplateTitleEditor from "@/components/TemplateTitleEditor";
import { Language, SessionUser } from "@/lib/types";

interface TemplateRow {
  id: string;
  title: string;
  title_es: string | null;
  category: string | null;
  recurrence_type: string;
  recurrence_config: string | null;
  effort: string;
  active: number;
}

const WEEKDAY_LABEL: Record<number, { en: string; es: string }> = {
  0: { en: "Sun", es: "Dom" },
  1: { en: "Mon", es: "Lun" },
  2: { en: "Tue", es: "Mar" },
  3: { en: "Wed", es: "Mié" },
  4: { en: "Thu", es: "Jue" },
  5: { en: "Fri", es: "Vie" },
  6: { en: "Sat", es: "Sáb" },
};

function scheduleSummary(tpl: TemplateRow, lang: Language): string {
  const config = tpl.recurrence_config ? JSON.parse(tpl.recurrence_config) : {};
  const parts = [tpl.recurrence_type];
  if (config.weekdays?.length) {
    parts.push(config.weekdays.map((d: number) => WEEKDAY_LABEL[d]?.[lang] ?? d).join("/"));
  }
  const dueTimes: string[] = config.dueTimes?.length ? config.dueTimes : config.dueTime ? [config.dueTime] : [];
  if (dueTimes.length > 0) {
    parts.push(
      dueTimes
        .map((t) => {
          const [h, m] = t.split(":").map(Number);
          const period = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return `${h12}:${String(m).padStart(2, "0")} ${period}`;
        })
        .join(", ")
    );
  }
  return parts.join(" · ");
}

function groupByCategory(templates: TemplateRow[]): Record<string, TemplateRow[]> {
  const groups: Record<string, TemplateRow[]> = {};
  for (const tpl of templates) {
    const key = tpl.category || "OTHER";
    (groups[key] ||= []).push(tpl);
  }
  return groups;
}

/** Every recurring task template, with create/edit affordances -- shared
 * between the standalone Templates page and the Add Task quick-log flow, so
 * "add a one-off task" and "manage the recurring ones" live in one place
 * instead of a recurring task being creatable from Quick Log but only
 * editable from a separate More menu entry nobody thinks to check. */
export default async function TemplatesManager({ user }: { user: SessionUser }) {
  const db = getDb();
  const templates = db
    .prepare(`SELECT id, title, title_es, category, recurrence_type, recurrence_config, effort, active FROM task_templates WHERE store_id = ? ORDER BY category, title`)
    .all(user.storeId) as TemplateRow[];
  const canManage = canDo(user, "templates.manage");

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <details className="card overflow-hidden">
          <summary className="cursor-pointer list-none px-3 py-3 text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Nueva plantilla" : "New template"}
          </summary>
          <div className="border-t border-border p-3">
            <TemplateForm lang={user.language} />
          </div>
        </details>
      )}

      {Object.entries(groupByCategory(templates)).map(([category, group]) => (
        <section key={category}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{category}</h2>
          <div className="card divide-y divide-border">
            {group.map((tpl) => (
              <div key={tpl.id}>
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.language === "es" && tpl.title_es ? tpl.title_es : tpl.title}</p>
                    <p className="text-xs text-muted">
                      {scheduleSummary(tpl, user.language)} · {tpl.effort}
                    </p>
                  </div>
                  {canManage ? (
                    <TemplateToggle id={tpl.id} active={!!tpl.active} lang={user.language} />
                  ) : (
                    <span className={`text-xs ${tpl.active ? "text-ok" : "text-muted"}`}>{tpl.active ? "Active" : "Off"}</span>
                  )}
                </div>
                {canManage && (
                  <>
                    <TemplateTitleEditor id={tpl.id} title={tpl.title} titleEs={tpl.title_es} lang={user.language} />
                    <TemplateScheduleEditor
                      id={tpl.id}
                      recurrenceType={tpl.recurrence_type}
                      config={tpl.recurrence_config ? JSON.parse(tpl.recurrence_config) : {}}
                      lang={user.language}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
