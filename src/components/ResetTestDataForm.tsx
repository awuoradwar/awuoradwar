"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetTestDataAction } from "@/app/actions/adminActions";
import { inputClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

export default function ResetTestDataForm({ lang }: { lang: Language }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section className="card border-critical/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-critical">{lang === "es" ? "Zona de peligro" : "Danger zone"}</p>
      <p className="mt-1 text-xs text-muted">
        {lang === "es"
          ? "Borra las tareas, tickets, capacitaciones y demás actividad de prueba. Los inicios de sesión, la configuración de la tienda, las plantillas y el inventario NO se borran."
          : "Clears out tasks, tickets, training records, and other activity created during testing. Logins, store setup, task templates, and inventory are NOT touched."}
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target mt-3 rounded-full border border-critical px-4 text-sm font-semibold text-critical"
        >
          {lang === "es" ? "Borrar datos de prueba…" : "Clear test data…"}
        </button>
      ) : done ? (
        <p className="mt-3 text-sm font-semibold text-ok">{lang === "es" ? "Listo. Datos de prueba borrados." : "Done. Test data cleared."}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData();
            fd.set("confirm", confirm);
            startTransition(async () => {
              const result = await resetTestDataAction(fd);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setDone(true);
              router.refresh();
            });
          }}
          className="mt-3 flex flex-col gap-2"
        >
          <p className="text-xs text-muted">
            {lang === "es" ? 'Escribe RESET (mayúsculas) para confirmar. Esto no se puede deshacer.' : "Type RESET (all caps) to confirm. This cannot be undone."}
          </p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} placeholder="RESET" autoFocus />
          {error && <p className="text-xs text-critical">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || confirm !== "RESET"}
              className="tap-target rounded-full bg-critical px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {pending ? "…" : lang === "es" ? "Borrar ahora" : "Clear now"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
              className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted"
            >
              {lang === "es" ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
