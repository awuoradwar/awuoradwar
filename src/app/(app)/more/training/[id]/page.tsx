import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTraineeDetail, getTraineeChecklist } from "@/lib/services/trainingService";
import PageHeader from "@/components/PageHeader";
import TrainingChecklist from "@/components/TrainingChecklist";
import MarkTraineeCompleteButton from "@/components/MarkTraineeCompleteButton";

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

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more/training" lang={user.language} title={trainee.name} />

      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
          {trainee.position === "FOH" ? "FOH (Counterhelp)" : "BOH (Kitchenhelp / COK)"}
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
    </div>
  );
}
