"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWasteEntryAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { WasteLogEntry } from "@/lib/services/wasteService";

const REASON_LABEL: Record<string, { en: string; es: string }> = {
  SPOILED: { en: "Spoiled/expired", es: "Dañado/caducado" },
  OVERPREP: { en: "Over-prepped", es: "Sobre-preparado" },
  DROPPED: { en: "Dropped/contaminated", es: "Caído/contaminado" },
  QUALITY: { en: "Quality issue", es: "Problema de calidad" },
  OTHER: { en: "Other", es: "Otro" },
};

export default function WasteLogRow({ entry, lang }: { entry: WasteLogEntry; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
  const router = useRouter();

  if (optimisticallyDeleted) return null;

  const total = entry.price_per_unit !== null ? entry.quantity * entry.price_per_unit : null;
  const reasonLabel = entry.reason ? REASON_LABEL[entry.reason] : null;

  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          {entry.item} · {entry.quantity} {entry.unit}
        </p>
        <p className="text-xs text-muted">
          {entry.wasted_date}
          {reasonLabel ? ` · ${lang === "es" ? reasonLabel.es : reasonLabel.en}` : ""}
          {entry.logged_by_name ? ` · ${entry.logged_by_name}` : ""}
        </p>
        {entry.notes && <p className="mt-0.5 text-xs text-muted">{entry.notes}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className={total !== null ? "font-semibold text-critical" : "text-xs text-muted"}>
          {total !== null ? `$${total.toFixed(2)}` : lang === "es" ? "Costo desconocido" : "Cost unknown"}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const msg = lang === "es" ? "¿Eliminar este registro? Esto no se puede deshacer." : "Delete this entry? This can't be undone.";
            if (!window.confirm(msg)) return;
            setOptimisticallyDeleted(true);
            startTransition(async () => {
              try {
                await deleteWasteEntryAction(entry.id);
              } catch {
                setOptimisticallyDeleted(false);
              }
              router.refresh();
            });
          }}
          className="text-xs font-medium text-critical disabled:opacity-50"
        >
          {lang === "es" ? "Eliminar" : "Delete"}
        </button>
      </div>
    </div>
  );
}
