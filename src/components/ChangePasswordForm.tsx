"use client";

import { useState, useTransition } from "react";
import { changeMyPasswordAction } from "@/app/actions/auth";
import { inputClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

export default function ChangePasswordForm({ lang }: { lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-semibold text-accent transition-opacity hover:opacity-75"
      >
        {lang === "es" ? "Cambiar contraseña" : "Change password"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const result = await changeMyPasswordAction(current, next);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setCurrent("");
          setNext("");
          setSuccess(true);
        });
      }}
      className="flex flex-col gap-2"
    >
      <input
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        type="password"
        placeholder={lang === "es" ? "Contraseña actual" : "Current password"}
        className={inputClass}
        autoFocus
      />
      <input
        value={next}
        onChange={(e) => setNext(e.target.value)}
        type="password"
        placeholder={lang === "es" ? "Nueva contraseña" : "New password"}
        className={inputClass}
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      {success && <p className="text-xs text-ok">{lang === "es" ? "Contraseña actualizada." : "Password updated."}</p>}
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
            setCurrent("");
            setNext("");
            setError(null);
            setSuccess(false);
            setEditing(false);
          }}
          className="tap-target rounded-full border border-border px-4 text-xs font-semibold text-muted"
        >
          {lang === "es" ? "Cerrar" : "Close"}
        </button>
      </div>
    </form>
  );
}
