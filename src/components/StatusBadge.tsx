import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const STYLES: Record<string, string> = {
  OPEN: "bg-zinc-100 text-zinc-700",
  IN_PROGRESS: "bg-amber-100 text-warning",
  COMPLETE: "bg-emerald-100 text-ok",
  COMPLETED: "bg-emerald-100 text-ok",
  CARRIED_FORWARD: "bg-amber-100 text-warning",
  CANCELLED: "bg-zinc-100 text-muted line-through",
  ASSIGNED: "bg-zinc-100 text-zinc-700",
  VERIFIED: "bg-emerald-100 text-ok",
  REOPENED: "bg-amber-100 text-warning",
  PENDING: "bg-amber-100 text-warning",
  PENDING_GM_APPROVAL: "bg-amber-100 text-warning",
  APPROVED: "bg-emerald-100 text-ok",
  DENIED: "bg-red-100 text-critical",
  NOT_REQUIRED: "bg-zinc-100 text-muted",
  SETTLED: "bg-emerald-100 text-ok",
  RESOLVED: "bg-emerald-100 text-ok",
  CRITICAL: "bg-red-100 text-critical",
  WAITING: "bg-amber-100 text-warning",
  SETTLEMENT_SELECTED: "bg-amber-100 text-warning",
  RETURN_PENDING: "bg-amber-100 text-warning",
};

const KEY_MAP: Record<string, string> = {
  OPEN: "status_open",
  IN_PROGRESS: "status_in_progress",
  COMPLETE: "status_complete",
  COMPLETED: "status_completed",
  CARRIED_FORWARD: "status_carried_forward",
  CANCELLED: "status_cancelled",
  ASSIGNED: "status_assigned",
  VERIFIED: "status_verified",
  REOPENED: "status_reopened",
  PENDING: "status_pending",
  APPROVED: "status_approved",
  DENIED: "status_denied",
  NOT_REQUIRED: "status_not_required",
  SETTLED: "status_settled",
  WAITING: "status_waiting",
  SETTLEMENT_SELECTED: "status_settlement_selected",
  RETURN_PENDING: "status_return_pending",
  RESOLVED: "status_resolved",
};

export default function StatusBadge({ status, lang }: { status: string; lang: Language }) {
  const style = STYLES[status] || "bg-zinc-100 text-zinc-700";
  const label = KEY_MAP[status] ? t(lang, KEY_MAP[status] as never) : status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
