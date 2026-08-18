import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getActivity, lastUpdatedBy } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { formatStoreDateTime } from "@/lib/storeTime";
import StatusBadge from "@/components/StatusBadge";
import IssueDetailActions from "@/components/IssueDetailActions";
import PageHeader from "@/components/PageHeader";

interface IssueRow {
  id: string;
  category: string;
  description: string;
  severity: string;
  status: string;
  due_date: string | null;
  owner_name: string | null;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface IssueUpdateRow {
  id: string;
  note: string;
  actor_name: string | null;
  created_at: string;
}

export default async function IssueDetailPage({ params }: PageProps<"/issue/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const issue = db
    .prepare(
      `SELECT i.*, u.name as owner_name FROM issues i LEFT JOIN users u ON u.id = i.owner_id WHERE i.id = ?`
    )
    .get(id) as IssueRow | undefined;
  if (!issue) notFound();

  const updates = db
    .prepare(
      `SELECT iu.id, iu.note, iu.created_at, u.name as actor_name
       FROM issue_updates iu LEFT JOIN users u ON u.id = iu.actor_id
       WHERE iu.issue_id = ? ORDER BY iu.created_at DESC`
    )
    .all(id) as IssueUpdateRow[];

  const activity = getActivity("issue", id) as Array<{
    id: string;
    action: string;
    actor_name: string | null;
    created_at: string;
  }>;
  const last = lastUpdatedBy("issue", id) as { actor_name: string | null; created_at: string } | undefined;
  const locale = user.language === "es" ? "es-MX" : "en-US";
  const fmt = (iso: string) => formatStoreDateTime(user.storeId, iso, locale);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more/work-orders" lang={user.language} title={issue.category.replace(/_/g, " ")} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={issue.status} lang={user.language} />
        {issue.severity === "CRITICAL" && <StatusBadge status="CRITICAL" lang={user.language} />}
        <span className="text-xs text-muted">{fmt(issue.created_at)}</span>
      </div>
      <p className="mt-3 text-sm text-muted">{issue.description}</p>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">{t(user.language, "field_owner")}</dt>
        <dd>{issue.owner_name || "—"}</dd>
        {issue.due_date && (
          <>
            <dt className="text-muted">{t(user.language, "field_due")}</dt>
            <dd>{new Date(issue.due_date + "T00:00:00").toLocaleDateString(user.language === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })}</dd>
          </>
        )}
        {issue.resolution && (
          <>
            <dt className="text-muted">{user.language === "es" ? "Resolución" : "Resolution"}</dt>
            <dd>{issue.resolution}</dd>
          </>
        )}
        {last && (
          <>
            <dt className="text-muted">{t(user.language, "field_last_updated_by")}</dt>
            <dd>
              {last.actor_name || "system"} · {fmt(last.created_at)}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <IssueDetailActions id={issue.id} lang={user.language} status={issue.status} />
      </div>

      {updates.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {user.language === "es" ? "Actualizaciones" : "Updates"}
          </h2>
          <div className="card divide-y divide-border">
            {updates.map((u) => (
              <div key={u.id} className="px-3 py-2 text-sm">
                <p>{u.note}</p>
                <p className="mt-1 text-xs text-muted">
                  {u.actor_name || "system"} · {fmt(u.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-accent">
          {t(user.language, "action_view_activity")} ({activity.length})
        </summary>
        <div className="card mt-2 divide-y divide-border">
          {activity.length === 0 && <p className="px-3 py-2 text-xs text-muted">{t(user.language, "detail_activity_none")}</p>}
          {activity.map((a) => (
            <div key={a.id} className="px-3 py-2 text-xs">
              <p className="font-medium">
                {a.action} · {a.actor_name || "system"}
              </p>
              <p className="text-muted">{fmt(a.created_at)}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
