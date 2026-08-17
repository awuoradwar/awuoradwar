import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTraineeDetail, getTraineeChecklist, getTrainingSessions } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL } from "@/lib/trainingLabels";
import { Position } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import TrainingChecklist from "@/components/TrainingChecklist";
import MarkTraineeCompleteButton from "@/components/MarkTraineeCompleteButton";
import TrainingSessionScheduler from "@/components/TrainingSessionScheduler";

export default async function TraineeDetailPage({ params }: PageProps<"/more/training/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const es = user.language === "es";

  const trainee = getTraineeDetail(id, user.storeId);
  if (!trainee) notFound();

  const items = getTraineeChecklist(trainee);
  const completedCount = items.filter((it) => it.trained_at).length;
  const allDone = items.length > 0 && completedCount === items.length;
  const sessions = getTrainingSessions(trainee.id);
  const db = getDb();
  const managers = db
    .prepare(`SELECT id, name FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`)
    .all() as Array<{ id: string; name: string; position: Position }>;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more/training" lang={user.language} title={trainee.name} />

      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
          {TRAINING_POSITION_LABEL[trainee.position][user.language]}
        </span>
        {trainee.status === "COMPLETE" && (
          <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{es ? "COMPLETO" : "COMPLETE"}</span>
        )}
        <span className="ml-auto text-xs text-muted">
          {completedCount}/{items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="card p-4 text-center text-sm text-muted">
          {es
            ? "Aún no hay pasos de capacitación para esta posición. Un GM puede agregarlos desde el menú Capacitación."
            : "No training steps for this position yet. A GM can add them from the Training menu."}
        </div>
      ) : (
        <TrainingChecklist traineeId={trainee.id} items={items} lang={user.language} />
      )}

      {trainee.status === "IN_PROGRESS" && (
        <div className="mt-4">
          <MarkTraineeCompleteButton traineeId={trainee.id} disabled={!allDone} lang={user.language} />
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Sesiones de capacitación programadas" : "Scheduled Training Sessions"}
        </h2>
        <TrainingSessionScheduler traineeId={trainee.id} sessions={sessions} managers={managers} lang={user.language} />
      </section>
    </div>
  );
}
