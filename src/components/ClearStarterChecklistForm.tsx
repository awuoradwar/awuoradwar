"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearStarterChecklistAction } from "@/app/actions/adminActions";
import { inputClass } from "./forms/FormShell";
import { Language } from "@/lib/types";

export default function ClearStarterChecklistForm({ lang }: { lang: Language }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section className="card border-critical/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-critical">
        {lang === "es" ? "Quitar lista de verificación inicial" : "Remove starter checklist"}
      </p>
      <p className="mt-1 text-xs text-muted">
        {lang === "es"
          ? "Elimina las tareas recurrentes de muestra (Loomis, Check Trends, camiones, etc.), las áreas/tareas de limpieza y las juntas -- para empezar totalmente en blanco y que tu equipo agregue sus propias tareas. El inventario, la capacitación, los inicios de sesión y la configuración de la tienda NO se tocan."
          : "Removes the sample recurring tasks (Loomis, Check Trends, truck days, etc.), cleaning areas/checklist, and meetings -- for a completely blank start where your team adds its own tasks. Inventory, training, logins, and store setup are NOT touched."}
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target mt-3 rounded-full border border-critical px-4 text-sm font-semibold text-critical"
        >
          {lang === "es" ? "Quitar lista inicial…" : "Remove starter checklist…"}
        </button>
      ) : done ? (
        <p className="mt-3 text-sm font-semibold text-ok">{lang === "es" ? "Listo. Lista inicial eliminada." : "Done. Starter checklist removed."}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData();
            fd.set("confirm", confirm);
            startTransition(async () => {
              const result = await clearStarterChecklistAction(fd);
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
            {lang === "es" ? "Escribe REMOVE (mayúsculas) para confirmar. Esto no se puede deshacer." : "Type REMOVE (all caps) to confirm. This cannot be undone."}
          </p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} placeholder="REMOVE" autoFocus />
          {error && <p className="text-xs text-critical">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || confirm !== "REMOVE"}
              className="tap-target rounded-full bg-critical px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {pending ? "…" : lang === "es" ? "Quitar ahora" : "Remove now"}
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
