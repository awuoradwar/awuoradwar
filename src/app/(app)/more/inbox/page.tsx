import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInboxProposals } from "@/lib/services/importService";
import { suggestOwnerForNewTask } from "@/lib/services/taskService";
import { getDb } from "@/lib/db";
import IngestForm from "@/components/IngestForm";
import ProposalRow from "@/components/ProposalRow";
import PageHeader from "@/components/PageHeader";

interface ProposalRowData {
  id: string;
  extracted_type: string;
  extracted_text: string;
  proposed_title: string;
  confidence: number;
  filename: string;
}

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const proposals = getInboxProposals(user.storeId) as ProposalRowData[];
  const suggestedOwner = suggestOwnerForNewTask(user.storeId);
  const managers = getDb()
    .prepare(`SELECT id, name FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`)
    .all() as { id: string; name: string }[];
  const cleaningAreas = getDb()
    .prepare(`SELECT id, name FROM cleaning_areas WHERE store_id = ? ORDER BY name`)
    .all(user.storeId) as { id: string; name: string }[];

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Bandeja / Importaciones" : "Inbox / Imports"} />
      <p className="-mt-3 mb-4 text-xs text-muted">
        {user.language === "es"
          ? "Nada de lo extraído por IA se activa hasta que un gerente lo revisa y aprueba."
          : "Nothing extracted by AI becomes active until a manager reviews and approves it."}
      </p>

      <details className="card mb-6 overflow-hidden">
        <summary className="cursor-pointer list-none px-3 py-3 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Pegar plan de la empresa" : "Paste company plan"}
        </summary>
        <div className="border-t border-border p-3">
          <IngestForm lang={user.language} />
        </div>
      </details>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Propuestas pendientes" : "Pending proposals"} ({proposals.length})
        </h2>
        {proposals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
            {user.language === "es" ? "Nada pendiente." : "Nothing pending."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {proposals.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                lang={user.language}
                managers={managers}
                suggestedOwnerId={suggestedOwner?.id ?? null}
                cleaningAreas={cleaningAreas}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
