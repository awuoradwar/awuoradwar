"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyEmailAction } from "@/app/actions/auth";
import { inputClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

export default function EditEmailForm({ email, lang }: { email: string; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email);
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
        {lang === "es" ? "Editar correo" : "Edit email"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateMyEmailAction(value);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setEditing(false);
          router.refresh();
        });
      }}
      className="flex flex-col gap-2"
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} type="email" className={inputClass} autoFocus />
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
            setValue(email);
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
