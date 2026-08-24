"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addManagerActivityAction, removeManagerActivityAction } from "@/app/actions/scheduleActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

interface ManagerOption {
  id: string;
  name: string;
}

interface DayOption {
  date: string;
  label: string;
}

interface ActivityEntry {
  id: string;
  user_id: string;
  user_name: string;
  date: string;
  label: string;
}

const PRESETS: Array<{ en: string; es: string }> = [
  { en: "Training", es: "Capacitación" },
  { en: "Area Meeting", es: "Junta de área" },
];

/** A quick way to note "working, just not covering the store" -- offsite
 * training, an area meeting -- so that day doesn't read as simply blank on
 * the schedule. Kept as its own short list rather than folded into the
 * shift grid: it's a visibility note for the team, not a shift, and a
 * manager can have any number of these independent of whatever shift (if
 * any) they're also working that day. */
export default function ManagerActivitiesSection({
  managers,
  days,
  activities,
  canEdit,
  lang,
}: {
  managers: ManagerOption[];
  days: DayOption[];
  activities: ActivityEntry[];
  canEdit: boolean;
  lang: Language;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState(managers[0]?.id ?? "");
  const [date, setDate] = useState(days[0]?.date ?? "");
  const [label, setLabel] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const router = useRouter();

  function remove(id: string) {
    if (!canEdit || pending) return;
    setRemovingId(id);
    startTransition(async () => {
      await removeManagerActivityAction(id);
      setRemovingId(null);
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
        {lang === "es" ? "Trabajando, pero no en tienda" : "Working, Not Covering the Store"}
      </h2>
      <p className="mb-2 text-xs text-muted">{lang === "es" ? "Capacitación, juntas de área, etc." : "Training, area meetings, etc."}</p>
      {activities.length > 0 && (
        <div className="card mb-2 divide-y divide-border">
          {activities.map((a) => {
            const day = days.find((d) => d.date === a.date);
            return (
              <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.user_name} · {a.label}
                  </p>
                  <p className="text-xs text-muted">{day?.label ?? a.date}</p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending && removingId === a.id}
                    onClick={() => remove(a.id)}
                    className="shrink-0 text-xs font-medium text-critical disabled:opacity-50"
                  >
                    {lang === "es" ? "Eliminar" : "Delete"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!canEdit ? null : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target w-full rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
        >
          {lang === "es" ? "+ Agregar" : "+ Add"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await addManagerActivityAction(userId, date, label);
              if (result && "error" in result && result.error) {
                setError(result.error);
                return;
              }
              setLabel("");
              setOpen(false);
              router.refresh();
            });
          }}
          className="card flex flex-col gap-3 p-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={lang === "es" ? "Gerente" : "Manager"}>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectClass}>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={lang === "es" ? "Día" : "Day"}>
              <select value={date} onChange={(e) => setDate(e.target.value)} className={selectClass}>
                {days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.en}
                type="button"
                onClick={() => setLabel(lang === "es" ? p.es : p.en)}
                className="rounded-full border border-accent/30 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
              >
                {lang === "es" ? p.es : p.en}
              </button>
            ))}
          </div>
          <Field label={lang === "es" ? "Motivo" : "Reason"}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus className={inputClass} placeholder={lang === "es" ? "ej. Capacitación" : "e.g. Training"} />
          </Field>
          {error && <p className="text-sm text-critical">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap-target flex-1 rounded-xl border border-border text-sm font-semibold text-muted"
            >
              {lang === "es" ? "Cancelar" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={pending || !label.trim()}
              className="tap-target flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "…" : lang === "es" ? "Agregar" : "Add"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
