"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCleaningAreaOwnerAction } from "@/app/actions/cleaningActions";
import { Language } from "@/lib/types";

export default function AssignAreaOwnerControl({
  areaId,
  ownerId,
  managers,
  lang,
}: {
  areaId: string;
  ownerId: string | null;
  managers: Array<{ id: string; name: string }>;
  lang: Language;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      value={ownerId || ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setCleaningAreaOwnerAction(areaId, e.target.value);
          router.refresh();
        })
      }
      className="h-6 min-h-0 rounded-full border border-border bg-card px-2 text-xs text-muted outline-none focus:border-accent disabled:opacity-50"
    >
      <option value="">{lang === "es" ? "Sin asignar" : "Unassigned"}</option>
      {managers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
