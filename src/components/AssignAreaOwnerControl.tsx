"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCleaningAreaOwnerAction } from "@/app/actions/cleaningActions";
import { Language } from "@/lib/types";

export default function AssignAreaOwnerControl({
  areaId,
  ownerId,
  managers,
  lang,
  stopClickPropagation,
}: {
  areaId: string;
  ownerId: string | null;
  managers: Array<{ id: string; name: string }>;
  lang: Language;
  /** Set when this renders inside a <summary> -- without it, using the
   * dropdown also toggles the parent <details> open/closed, since a click
   * anywhere in <summary> triggers its native toggle. */
  stopClickPropagation?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // Being a controlled <select> bound straight to the server prop, without
  // this it visibly snaps back to the old value the instant you pick a new
  // one -- not just "slow," actively wrong -- until the round trip lands.
  // useOptimistic (not a plain flag) so it self-clears against whatever the
  // server prop actually is once refreshed, instead of permanently masking
  // a reassignment made from elsewhere.
  const [displayOwnerId, setOptimisticOwnerId] = useOptimistic(ownerId || "", (_state, next: string) => next);
  const router = useRouter();

  return (
    <select
      value={displayOwnerId}
      disabled={pending}
      onClick={stopClickPropagation ? (e) => e.stopPropagation() : undefined}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          setOptimisticOwnerId(next);
          await setCleaningAreaOwnerAction(areaId, next);
          router.refresh();
        });
      }}
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
