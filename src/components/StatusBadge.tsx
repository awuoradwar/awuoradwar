import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const STYLES: Record<string, string> = {
  OPEN: "bg-muted/10 text-muted",
  IN_PROGRESS: "bg-warning/10 text-warning",
  COMPLETE: "bg-ok/10 text-ok",
  COMPLETED: "bg-ok/10 text-ok",
  CARRIED_FORWARD: "bg-warning/10 text-warning",
  CANCELLED: "bg-muted/10 text-muted line-through",
  ASSIGNED: "bg-muted/10 text-muted",
  VERIFIED: "bg-ok/10 text-ok",
  REOPENED: "bg-warning/10 text-warning",
  PENDING: "bg-warning/10 text-warning",
  PENDING_GM_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-ok/10 text-ok",
  DENIED: "bg-critical/10 text-critical",
  NOT_REQUIRED: "bg-muted/10 text-muted",
  SETTLED: "bg-ok/10 text-ok",
  RESOLVED: "bg-ok/10 text-ok",
  CRITICAL: "bg-critical/10 text-critical",
  WAITING: "bg-warning/10 text-warning",
  SETTLEMENT_SELECTED: "bg-warning/10 text-warning",
  RETURN_PENDING: "bg-warning/10 text-warning",
  OVERDUE: "bg-critical/10 text-critical",
  // Due within 24 hours is close enough to overdue to read as urgent, not
  // just "in progress" -- same red as OVERDUE rather than the amber used
  // for ordinary pending/waiting states, so it actually draws the eye.
  DUE_SOON: "bg-critical/10 text-critical",
  PAID: "bg-ok/10 text-ok",
  UNPAID: "bg-critical/10 text-critical",
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
  OVERDUE: "status_overdue",
  DUE_SOON: "status_due_soon",
  PAID: "status_paid",
  UNPAID: "status_unpaid",
};

export default function StatusBadge({ status, lang }: { status: string; lang: Language }) {
  const style = STYLES[status] || "bg-muted/10 text-muted";
  const label = KEY_MAP[status] ? t(lang, KEY_MAP[status] as never) : status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
