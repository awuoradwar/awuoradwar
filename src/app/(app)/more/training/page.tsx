import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTrainees, getTrainingItems } from "@/lib/services/trainingService";
import { TRAINING_POSITIONS } from "@/lib/trainingLabels";
import { isGM } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import AddTraineeForm from "@/components/AddTraineeForm";
import TraineeRow from "@/components/TraineeRow";
import TrainingItemsManager from "@/components/TrainingItemsManager";

export default async function TrainingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const es = user.language === "es";

  const trainees = getTrainees(user.storeId);
  const inProgress = trainees.filter((t) => t.status === "IN_PROGRESS");
  const complete = trainees.filter((t) => t.status === "COMPLETE");
  const itemsByPosition = Object.fromEntries(TRAINING_POSITIONS.map((p) => [p, getTrainingItems(user.storeId, p)])) as Record<
    (typeof TRAINING_POSITIONS)[number],
    ReturnType<typeof getTrainingItems>
  >;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={es ? "Capacitación de Nuevos Asociados" : "New Associate Training"} />
      <p className="-mt-3 mb-4 text-xs text-muted">
        {es
          ? "Cualquier gerente puede marcar los pasos completados durante su turno -- el próximo gerente ve exactamente dónde quedó."
          : "Any manager can check off steps during their shift -- the next manager sees exactly where training left off."}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Agregar nuevo asociado" : "Add new associate"}
        </h2>
        <AddTraineeForm lang={user.language} />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "En capacitación" : "In training"}
        </h2>
        {inProgress.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted">
            {es ? "Nadie en capacitación en este momento." : "No one in training right now."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {inProgress.map((t) => (
              <TraineeRow key={t.id} item={t} lang={user.language} />
            ))}
          </div>
        )}
      </section>

      {complete.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
            {es ? "Completado" : "Completed"}
          </h2>
          <div className="card divide-y divide-border">
            {complete.map((t) => (
              <TraineeRow key={t.id} item={t} lang={user.language} />
            ))}
          </div>
        </section>
      )}

      {isGM(user) && (
        <section>
          <TrainingItemsManager itemsByPosition={itemsByPosition} lang={user.language} />
        </section>
      )}
    </div>
  );
}
