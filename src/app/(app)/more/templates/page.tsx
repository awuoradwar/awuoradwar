import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canDo } from "@/lib/permissions";
import TemplateToggle from "@/components/TemplateToggle";
import TemplateForm from "@/components/TemplateForm";
import PageHeader from "@/components/PageHeader";

interface TemplateRow {
  id: string;
  title: string;
  category: string | null;
  recurrence_type: string;
  effort: string;
  active: number;
}

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getDb();
  const templates = db
    .prepare(`SELECT id, title, category, recurrence_type, effort, active FROM task_templates WHERE store_id = ? ORDER BY category, title`)
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

      <div className="card divide-y divide-border">
        {templates.map((tpl) => (
          <div key={tpl.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{tpl.title}</p>
              <p className="text-xs text-muted">
                {tpl.category} · {tpl.recurrence_type} · {tpl.effort}
              </p>
            </div>
            {canManage ? (
              <TemplateToggle id={tpl.id} active={!!tpl.active} lang={user.language} />
            ) : (
              <span className={`text-xs ${tpl.active ? "text-ok" : "text-muted"}`}>{tpl.active ? "Active" : "Off"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
