"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveProposalAction, rejectProposalAction } from "@/app/actions/importActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

interface ProposalRowData {
  id: string;
  extracted_type: string;
  extracted_text: string;
  proposed_title: string;
  confidence: number;
  filename: string;
}

const TYPE_LABEL_EN: Record<string, string> = {
  CLEANING: "🧹 Cleaning",
  OPERATIONAL: "⚙️ Operational",
  DEADLINE: "⏰ Deadline",
  METRIC: "📊 Metric",
  INFO: "ℹ️ Info",
};
const TYPE_LABEL_ES: Record<string, string> = {
  CLEANING: "🧹 Limpieza",
  OPERATIONAL: "⚙️ Operativo",
  DEADLINE: "⏰ Plazo",
  METRIC: "📊 Métrica",
  INFO: "ℹ️ Información",
};

interface Manager {
  id: string;
  name: string;
}

interface CleaningArea {
  id: string;
  name: string;
}

export default function ProposalRow({
  proposal,
  lang,
  managers = [],
  suggestedOwnerId = null,
  cleaningAreas = [],
}: {
  proposal: ProposalRowData;
  lang: Language;
  managers?: Manager[];
  suggestedOwnerId?: string | null;
  cleaningAreas?: CleaningArea[];
}) {
  const [title, setTitle] = useState(proposal.proposed_title);
  const [ownerId, setOwnerId] = useState(suggestedOwnerId || "");
  const [cleaningAreaId, setCleaningAreaId] = useState(cleaningAreas[0]?.id || "");
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const typeLabel = lang === "es" ? TYPE_LABEL_ES : TYPE_LABEL_EN;
  const willCreateTask = proposal.extracted_type !== "INFO";
  const isCleaning = proposal.extracted_type === "CLEANING";
  const suggestedName = managers.find((m) => m.id === suggestedOwnerId)?.name;

  return (
    <div className="card p-3">
      <p className="text-xs text-muted">{typeLabel[proposal.extracted_type] || proposal.extracted_type} · {proposal.filename}</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="tap-target mt-1 w-full rounded-lg border border-border bg-background px-3 text-sm"
      />
      {isCleaning && cleaningAreas.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <label className="text-[11px] text-muted">{lang === "es" ? "Área de limpieza" : "Cleaning area"}</label>
            <select
              value={cleaningAreaId}
              onChange={(e) => setCleaningAreaId(e.target.value)}
              className="tap-target mt-1 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              {cleaningAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted">{lang === "es" ? "Frecuencia" : "Frequency"}</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "DAILY" | "WEEKLY")}
              className="tap-target mt-1 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="DAILY">{lang === "es" ? "Diaria" : "Daily"}</option>
              <option value="WEEKLY">{lang === "es" ? "Semanal" : "Weekly"}</option>
            </select>
          </div>
        </div>
      )}
      {willCreateTask && !isCleaning && managers.length > 0 && (
        <div className="mt-2">
          <label className="text-[11px] text-muted">
            {t(lang, "import_suggested_owner")}
            {suggestedName ? ` — ${suggestedName}` : ""}
          </label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="tap-target mt-1 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">{t(lang, "import_owner_unassigned")}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === suggestedOwnerId ? (lang === "es" ? " (sugerido)" : " (suggested)") : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await approveProposalAction(
                proposal.id,
                title,
                willCreateTask,
                ownerId || null,
                isCleaning ? cleaningAreaId || null : null,
                frequency
              );
              router.refresh();
            })
          }
          className="tap-target flex-1 rounded-full bg-ok/10 px-3 text-xs font-semibold text-ok disabled:opacity-50"
        >
          {lang === "es" ? "Aprobar y agregar" : "Approve & Add"}
        </button>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await rejectProposalAction(proposal.id);
              router.refresh();
            })
          }
          className="tap-target flex-1 rounded-full bg-critical/10 px-3 text-xs font-semibold text-critical disabled:opacity-50"
        >
          {lang === "es" ? "Rechazar" : "Reject"}
        </button>
      </div>
    </div>
  );
}
