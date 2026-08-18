"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStoreProfileAction } from "@/app/actions/adminActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function EditStoreForm({ name, timezone, lang }: { name: string; timezone: string; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-semibold text-accent transition-opacity hover:opacity-75"
      >
        {lang === "es" ? "Editar tienda" : "Edit store info"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateStoreProfileAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setEditing(false);
          router.refresh();
        });
      }}
      className="flex flex-col gap-3"
    >
      <Field label={lang === "es" ? "Nombre de la tienda" : "Store name"}>
        <input name="name" defaultValue={name} required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Zona horaria" : "Timezone"}>
        <select name="timezone" defaultValue={timezone} className={selectClass}>
          {US_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="tap-target rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground shadow-sm disabled:opacity-60"
        >
          {pending ? "…" : lang === "es" ? "Guardar" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
          className="tap-target rounded-full border border-border px-4 text-xs font-semibold text-muted"
        >
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
