"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkAddCleaningTasksAction } from "@/app/actions/cleaningActions";
import { inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

interface Row {
  area: string;
  category: "FOH" | "BOH" | "FACILITIES";
  title: string;
  frequency: "DAILY" | "WEEKLY";
  weekday: string; // "" = any day this week
  photoRequired: boolean;
}

const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function blankRow(): Row {
  return { area: "", category: "FOH", title: "", frequency: "DAILY", weekday: "", photoRequired: false };
}

export default function BulkAddCleaningForm({ lang, existingAreas }: { lang: Language; existingAreas: string[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, blankRow));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const weekdayLabels = lang === "es" ? WEEKDAYS_ES : WEEKDAYS_EN;

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target mb-3 flex w-full items-center justify-center rounded-xl border-2 border-dashed border-accent text-sm font-semibold text-accent"
      >
        {lang === "es" ? "+ Agregar mi tabla de limpieza (varias a la vez)" : "+ Add my cleaning chart (bulk)"}
      </button>
    );
  }

  return (
    <div className="card mb-6 flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{lang === "es" ? "Agregar tabla de limpieza" : "Add cleaning chart"}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-muted">
          {lang === "es" ? "Cerrar" : "Close"}
        </button>
      </div>
      <p className="text-xs text-muted">
        {lang === "es"
          ? "Escribe una fila por tarea, tal como aparece en la tabla de tu empresa. Un área nueva se crea sola al escribir su nombre."
          : "One row per task, matching your company chart. Typing a new area name creates it automatically."}
      </p>

      <datalist id="cleaning-area-suggestions">
        {existingAreas.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {lang === "es" ? "Fila" : "Row"} {i + 1}
              </span>
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-critical">
                  {lang === "es" ? "Quitar" : "Remove"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={row.area}
                onChange={(e) => update(i, { area: e.target.value })}
                placeholder={lang === "es" ? "Área (ej. Línea de cocina)" : "Area (e.g. Cook Line)"}
                list="cleaning-area-suggestions"
                className={`${inputClass} col-span-2`}
              />
              <select value={row.category} onChange={(e) => update(i, { category: e.target.value as Row["category"] })} className={selectClass}>
                <option value="FOH">{lang === "es" ? "Frente (FOH)" : "Front (FOH)"}</option>
                <option value="BOH">{lang === "es" ? "Cocina (BOH)" : "Back (BOH)"}</option>
                <option value="FACILITIES">{lang === "es" ? "Instalaciones" : "Facilities"}</option>
              </select>
              <input
                value={row.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder={lang === "es" ? "Tarea (ej. Limpiar wok)" : "Task (e.g. Clean wok)"}
                className={`${inputClass} col-span-2`}
              />
              <select value={row.frequency} onChange={(e) => update(i, { frequency: e.target.value as Row["frequency"], weekday: "" })} className={selectClass}>
                <option value="DAILY">{lang === "es" ? "Diaria" : "Daily"}</option>
                <option value="WEEKLY">{lang === "es" ? "Semanal" : "Weekly"}</option>
              </select>
              {row.frequency === "WEEKLY" && (
                <select value={row.weekday} onChange={(e) => update(i, { weekday: e.target.value })} className={selectClass}>
                  <option value="">{lang === "es" ? "Cualquier día" : "Any day"}</option>
                  {weekdayLabels.map((d, idx) => (
                    <option key={idx} value={idx}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              <label className="col-span-2 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={row.photoRequired} onChange={(e) => update(i, { photoRequired: e.target.checked })} className="h-4 w-4" />
                {lang === "es" ? "Requiere foto" : "Photo required"}
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, blankRow()])}
        className="tap-target rounded-xl border border-dashed border-border text-xs font-semibold text-muted"
      >
        {lang === "es" ? "+ Otra fila" : "+ Another row"}
      </button>

      {error && <p className="text-xs text-critical">{error}</p>}
      {success !== null && (
        <p className="text-xs font-semibold text-ok">
          {lang === "es" ? `¡Listo! Se agregaron ${success} tareas.` : `Done! Added ${success} tasks.`}
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setSuccess(null);
          const fd = new FormData();
          fd.set("rowCount", String(rows.length));
          rows.forEach((r, i) => {
            fd.set(`area_${i}`, r.area);
            fd.set(`category_${i}`, r.category);
            fd.set(`title_${i}`, r.title);
            fd.set(`frequency_${i}`, r.frequency);
            fd.set(`weekday_${i}`, r.weekday);
            if (r.photoRequired) fd.set(`photoRequired_${i}`, "on");
          });
          startTransition(async () => {
            const result = await bulkAddCleaningTasksAction(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setSuccess(result?.count ?? 0);
            setRows(Array.from({ length: 5 }, blankRow));
            router.refresh();
          });
        }}
        className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-sm disabled:opacity-60"
      >
        {pending ? "…" : lang === "es" ? "Guardar todas las filas" : "Save all rows"}
      </button>
    </div>
  );
}
