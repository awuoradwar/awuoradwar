import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getShiftHistory } from "@/lib/services/searchService";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";

export default async function ShiftHistoryPage({ params }: PageProps<"/history/[shiftId]">) {
  const { shiftId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const history = getShiftHistory(user.storeId, shiftId);
  if (!history) notFound();
  const { shift, tasks, guestRecoveries, issues, borrowedItems, cleaningActivity, handoff } = history;
  const es = user.language === "es";

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more/reports" lang={user.language} title={shift.date} />
      <p className="-mt-2 mb-1 flex items-center gap-1 text-xs text-muted">
        PIC: {shift.pic_name || "—"} · <StatusBadge status={shift.status} lang={user.language} />
      </p>

      <Section title={es ? `Tareas (${tasks.length})` : `Tasks (${tasks.length})`} count={tasks.length}>
        {tasks.map((t, i) => (
          <Row key={i} left={t.title} right={<StatusBadge status={t.status} lang={user.language} />} />
        ))}
      </Section>

      <Section title={es ? `Actividad de limpieza (${cleaningActivity.length})` : `Cleaning activity (${cleaningActivity.length})`} count={cleaningActivity.length}>
        {cleaningActivity.map((c, i) => (
          <Row key={i} left={`${c.title} · ${c.action}`} right={<span className="text-xs text-muted">{c.actor_name || "—"}</span>} />
        ))}
      </Section>

      <Section title={es ? `Recuperaciones de clientes (${guestRecoveries.length})` : `Guest recoveries (${guestRecoveries.length})`} count={guestRecoveries.length}>
        {guestRecoveries.map((g, i) => (
          <Row key={i} left={g.issue_category} right={<StatusBadge status={g.replacement_status} lang={user.language} />} />
        ))}
      </Section>

      <Section title={es ? `Problemas (${issues.length})` : `Issues (${issues.length})`} count={issues.length}>
        {issues.map((it, i) => (
          <Row key={i} left={`${it.category}: ${it.description}`} right={<StatusBadge status={it.status} lang={user.language} />} />
        ))}
      </Section>

      <Section title={es ? `Artículos prestados (${borrowedItems.length})` : `Borrowed items (${borrowedItems.length})`} count={borrowedItems.length}>
        {borrowedItems.map((b, i) => (
          <Row
            key={i}
            left={`${b.direction === "LENT" ? (es ? "Prestado a" : "Lent to") : es ? "Prestado de" : "Borrowed from"} ${b.borrowed_from}: ${b.item}`}
            right={<StatusBadge status={b.status} lang={user.language} />}
          />
        ))}
      </Section>

      <Section title={es ? "Entrega" : "Handoff"} count={handoff ? 1 : 0}>
        {handoff && (
          <Row
            left={`${handoff.outgoing_pic_name || "—"} → ${handoff.incoming_pic_name || "—"}`}
            right={<StatusBadge status={handoff.status} lang={user.language} />}
          />
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{title}</h2>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">—</p>
      ) : (
        <div className="card divide-y divide-border">{children}</div>
      )}
    </section>
  );
}

function Row({ left, right }: { left: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <p className="min-w-0 truncate">{left}</p>
      <div className="shrink-0">{right}</div>
    </div>
  );
}
