import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTrainingHistory, getTrainingRetrainFrequency } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL } from "@/lib/trainingLabels";
import { formatStoreDateTime } from "@/lib/storeTime";
import HistoryByWeek from "@/components/HistoryByWeek";
import PageHeader from "@/components/PageHeader";
import { Language } from "@/lib/types";

function itemLabel(title: string, titleEs: string | null, lang: Language) {
  return lang === "es" && titleEs ? titleEs : title;
}

export default async function TrainingHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;
  const es = lang === "es";
  const locale = es ? "es-MX" : "en-US";

  const history = getTrainingHistory(user.storeId);
  const retrainFrequency = getTrainingRetrainFrequency(user.storeId);

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more/training" lang={lang} title={es ? "Historial de Capacitación" : "Training History"} />
      <p className="-mt-3 mb-4 text-xs text-muted">
        {es
          ? "Cada capacitación y recapacitación registrada en la tienda, para ver qué pasos son difíciles para los nuevos asociados y cuánto tiempo toma recapacitar."
          : "Every training and retrain logged store-wide -- shows which steps are hard for new associates, and how long it takes to retrain."}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {es ? "Frecuencia de Recapacitación" : "Retrain Frequency"}
        </h2>
        {retrainFrequency.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted">
            {es ? "Sin recapacitaciones registradas todavía." : "No retrains logged yet."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {retrainFrequency.map((r) => (
              <div key={`${r.position}|${r.item_title}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{itemLabel(r.item_title, r.item_title_es, lang)}</p>
                  <p className="text-xs text-muted">{TRAINING_POSITION_LABEL[r.position]?.[lang] || r.position}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-warning">
                    {r.retrainCount} {es ? (r.retrainCount === 1 ? "recapacitación" : "recapacitaciones") : r.retrainCount === 1 ? "retrain" : "retrains"}
                  </p>
                  <p className="text-xs text-muted">
                    {r.traineeCount} {es ? (r.traineeCount === 1 ? "asociado" : "asociados") : r.traineeCount === 1 ? "associate" : "associates"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Registro Completo" : "Full Log"}</h2>
        <div className="card overflow-hidden">
          <HistoryByWeek
            items={history}
            getDate={(h) => h.trained_at}
            keyOf={(h) => h.id}
            lang={lang}
            emptyLabel={es ? "Nada registrado todavía." : "Nothing logged yet."}
            renderItem={(h) => (
              <div className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">
                    {h.trainee_name} · {itemLabel(h.item_title, h.item_title_es, lang)}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      h.isRetrain ? "bg-warning/10 text-warning" : "bg-ok/10 text-ok"
                    }`}
                  >
                    {h.isRetrain ? `↻ ${es ? "Recapacitado" : "Retrained"}` : es ? "Capacitado" : "Trained"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {TRAINING_POSITION_LABEL[h.position]?.[lang] || h.position} · {formatStoreDateTime(user.storeId, h.trained_at, locale, { month: "short", day: "numeric" })}
                  {h.shift_type ? ` · ${h.shift_type}` : ""} · {h.trained_by_name || "—"}
                  {h.isRetrain && h.daysSincePrevious !== null && (
                    <span className="text-warning">
                      {" "}
                      · {h.daysSincePrevious} {es ? (h.daysSincePrevious === 1 ? "día desde la última vez" : "días desde la última vez") : h.daysSincePrevious === 1 ? "day since last" : "days since last"}
                    </span>
                  )}
                </p>
                {h.notes && <p className="mt-0.5 text-xs italic text-muted">{h.notes}</p>}
              </div>
            )}
          />
        </div>
      </section>
    </div>
  );
}
