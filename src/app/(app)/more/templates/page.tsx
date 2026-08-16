import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canDo } from "@/lib/permissions";
import TemplateToggle from "@/components/TemplateToggle";
import TemplateForm from "@/components/TemplateForm";
import TemplateScheduleEditor from "@/components/TemplateScheduleEditor";
import PageHeader from "@/components/PageHeader";
import { Language } from "@/lib/types";

interface TemplateRow {
  id: string;
  title: string;
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
  if (config.dueTime) {
    const [h, m] = config.dueTime.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    parts.push(`${h12}:${String(m).padStart(2, "0")} ${period}`);
  }
  return parts.join(" · ");
}

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getDb();
  const templates = db
    .prepare(`SELECT id, title, category, recurrence_type, recurrence_config, effort, active FROM task_templates WHERE store_id = ? ORDER BY category, title`)
    .all(user.storeId) as TemplateRow[];
  const canManage = canDo(user, "templates.manage");

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Plantillas" : "Templates"} />

      {canManage && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Nueva plantilla" : "New template"}
          </h2>
          <TemplateForm lang={user.language} />
        </section>
      )}

      {Object.entries(groupByCategory(templates)).map(([category, group]) => (
        <section key={category} className="mb-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{category}</h2>
          <div className="card divide-y divide-border">
            {group.map((tpl) => (
              <div key={tpl.id}>
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tpl.title}</p>
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
                  <TemplateScheduleEditor
                    id={tpl.id}
                    recurrenceType={tpl.recurrence_type}
                    config={tpl.recurrence_config ? JSON.parse(tpl.recurrence_config) : {}}
                    lang={user.language}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByCategory(templates: TemplateRow[]): Record<string, TemplateRow[]> {
  const groups: Record<string, TemplateRow[]> = {};
  for (const tpl of templates) {
    const key = tpl.category || "OTHER";
    (groups[key] ||= []).push(tpl);
  }
  return groups;
}
