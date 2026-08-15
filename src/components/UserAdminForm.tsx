"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUserAction } from "@/app/actions/adminActions";
import { Field, inputClass, selectClass } from "./forms/FormShell";
import { Language, Position } from "@/lib/types";
import { POSITION_LABEL } from "@/lib/permissions";

const ASSIGNABLE_POSITIONS: Position[] = ["ASSISTANT_MANAGER", "CHEF", "VISITING_MANAGER", "GM"];

export default function UserAdminForm({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const result = await createUserAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setSuccess(lang === "es" ? "Usuario creado. Contraseña temporal: shiftops123" : "User created. Temporary password: shiftops123");
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
      className="card flex flex-col gap-3 p-3"
    >
      <Field label={lang === "es" ? "Nombre" : "Name"}>
        <input name="name" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Correo" : "Email"}>
        <input name="email" type="email" required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Puesto" : "Position"}>
        <select name="position" defaultValue="ASSISTANT_MANAGER" className={selectClass}>
          {ASSIGNABLE_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p][lang]}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="text-sm text-critical">{error}</p>}
      {success && <p className="text-sm text-ok">{success}</p>}
      <button type="submit" disabled={pending} className="tap-target rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-60">
        {pending ? "…" : lang === "es" ? "Crear usuario" : "Create user"}
      </button>
    </form>
  );
}
