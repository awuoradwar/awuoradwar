"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserAction } from "@/app/actions/adminActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language, Position } from "@/lib/types";
import { POSITION_LABEL } from "@/lib/permissions";

const ASSIGNABLE_POSITIONS: Position[] = ["ASSISTANT_MANAGER", "CHEF", "VISITING_MANAGER", "GM"];

export default function EditUserForm({
  id,
  name,
  email,
  position,
  lang,
}: {
  id: string;
  name: string;
  email: string;
  position: Position;
  lang: Language;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-accent transition-opacity hover:opacity-75">
        {lang === "es" ? "Editar" : "Edit"}
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
          const result = await updateUserAction(id, fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setEditing(false);
          router.refresh();
        });
      }}
      className="flex w-full basis-full flex-col gap-2 pt-2"
    >
      <Field label={lang === "es" ? "Nombre" : "Name"}>
        <input name="name" defaultValue={name} required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Correo" : "Email"}>
        <input name="email" type="email" defaultValue={email} required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Puesto" : "Position"}>
        <select name="position" defaultValue={position} className={selectClass}>
          {ASSIGNABLE_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p][lang]}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="tap-target rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground shadow-sm disabled:opacity-60">
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
