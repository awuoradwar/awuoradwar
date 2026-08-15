import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getAcknowledgementsWithStatus } from "@/lib/services/acknowledgementService";
import { t } from "@/lib/i18n";
import AcknowledgementRow, { CompletionRow } from "@/components/AcknowledgementRow";

interface AckWithStatus {
  id: string;
  title: string;
  source: string | null;
  manager_name: string | null;
  outstanding: number;
  total: number;
  completions: CompletionRow[];
}

export default async function AcknowledgementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const acks = getAcknowledgementsWithStatus(user.storeId) as unknown as AckWithStatus[];

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <Link href="/more" className="mb-3 inline-block text-sm text-muted">
        ← {user.language === "es" ? "Atrás" : "Back"}
      </Link>
      <h1 className="mb-4 text-lg font-semibold">{t(user.language, "more_acknowledgements")}</h1>

      {acks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
          {t(user.language, "all_clear")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {acks.map((a) => (
            <details key={a.id} className="card p-3" open={a.outstanding > 0}>
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
                <span className="truncate">{a.title}</span>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " +
                    (a.outstanding > 0 ? "bg-amber-100 text-warning" : "bg-emerald-100 text-ok")
                  }
                >
                  {a.total - a.outstanding}/{a.total}
                </span>
              </summary>
              <p className="mt-1 text-xs text-muted">
                {a.source ? `${a.source} · ` : ""}
                {t(user.language, "field_responsible_manager")}: {a.manager_name || "—"}
              </p>
              <div className="mt-2 divide-y divide-border rounded-xl border border-border">
                {a.completions.map((c) => (
                  <AcknowledgementRow key={c.id} completion={c} lang={user.language} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
