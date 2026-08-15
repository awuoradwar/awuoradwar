import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getInboxProposals } from "@/lib/services/importService";
import { suggestOwnerForNewTask } from "@/lib/services/taskService";
import { getDb } from "@/lib/db";
import IngestForm from "@/components/IngestForm";
import ProposalRow from "@/components/ProposalRow";

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

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <Link href="/more" className="mb-3 inline-block text-sm text-muted">
        ← {user.language === "es" ? "Atrás" : "Back"}
      </Link>
      <h1 className="mb-1 text-lg font-semibold">{user.language === "es" ? "Bandeja / Importaciones" : "Inbox / Imports"}</h1>
      <p className="mb-4 text-xs text-muted">
        {user.language === "es"
          ? "Nada de lo extraído por IA se activa hasta que un gerente lo revisa y aprueba."
          : "Nothing extracted by AI becomes active until a manager reviews and approves it."}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Pegar plan de la empresa" : "Paste company plan"}
        </h2>
        <IngestForm lang={user.language} />
      </section>

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
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
