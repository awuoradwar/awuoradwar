import { formatStoreDateTime } from "@/lib/storeTime";
import { ProcedureCategory, ProcedureSubmission } from "@/lib/services/procedureService";
import { Language } from "@/lib/types";
import EditSubmissionDateButton from "./EditSubmissionDateButton";

const CATEGORY_LABEL: Record<ProcedureCategory, Record<Language, string>> = {
  FOH: { en: "Front of House", es: "Área de Clientes" },
  BOH: { en: "Back of House", es: "Área de Cocina" },
  PATIO_WINDOWS: { en: "Patio & Windows", es: "Patio y Ventanas" },
};

/** One submitted checklist, collapsed to who/when/how-many-checked by
 * default -- tapping it opens up exactly what was checked (and any note),
 * the same "how they answered" detail everywhere a submission shows up:
 * the Procedures page's Recent Submissions list and each station's
 * per-day week view. Plain server-renderable markup (native
 * details/summary), no client JS needed. */
export default function ProcedureSubmissionRow({
  submission,
  storeId,
  lang,
  compact = false,
  canEdit = false,
}: {
  submission: ProcedureSubmission;
  storeId: string;
  lang: Language;
  /** Skips the area name / shift type line in the summary -- for a context
   * (a station's own week view) that already shows that around the row, so
   * the summary is just who + when instead of repeating what's already on
   * screen. */
  compact?: boolean;
  /** Shows the "Edit date" affordance -- only for a manager with
   * procedures.manage (the same permission every other edit on this
   * feature already requires), and even then only a date correction, not
   * the checklist answers themselves. */
  canEdit?: boolean;
}) {
  const es = lang === "es";
  const items = JSON.parse(submission.items_json) as Array<{ text: string; textEs: string | null; checked: boolean; checkedBy?: string | null; section?: string | null }>;
  const checkedCount = items.filter((i) => i.checked).length;
  // Same section grouping as ProcedureKiosk -- an area that covers what
  // used to be several separate stations keeps each one's items under its
  // own header here too, not just while the checklist is being taken.
  let lastSection: string | null | undefined = undefined;
  // "Juan & Maria" is the only shape a multi-associate name ever takes (see
  // ProcedureKiosk) -- only then does per-item checkedBy attribution mean
  // anything, so a single associate's row stays exactly as plain as before.
  const multiAssociate = submission.associate_name.includes(" & ");
  const locale = es ? "es-MX" : "en-US";
  const time = formatStoreDateTime(storeId, submission.created_at, locale, { hour: "numeric", minute: "2-digit" });

  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm">
        <div className="min-w-0">
          {compact ? (
            <p className="truncate font-semibold text-ok">
              ✓ {submission.associate_name} <span className="font-normal text-muted">{time}</span>
            </p>
          ) : (
            <>
              <p className="truncate font-semibold">
                {es && submission.area_name_es ? submission.area_name_es : submission.area_name} ·{" "}
                {submission.shift_type === "OPENING" ? (es ? "Apertura" : "Opening") : es ? "Cierre" : "Closing"}
              </p>
              <p className="truncate text-xs text-muted">
                {submission.associate_name} · {submission.area_category && CATEGORY_LABEL[submission.area_category][lang]} · {time}
              </p>
            </>
          )}
        </div>
        <span className={`shrink-0 text-xs font-semibold ${checkedCount === items.length ? "text-ok" : "text-warning"}`}>
          {checkedCount}/{items.length}
        </span>
      </summary>
      <div className="flex flex-col gap-1 border-t border-border p-3 text-sm">
        {items.map((item, i) => {
          const showHeader = item.section && item.section !== lastSection;
          lastSection = item.section ?? null;
          return (
            <div key={i}>
              {showHeader && <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted first:mt-0">{item.section}</p>}
              <div className="flex items-center gap-2">
                <span className={item.checked ? "text-ok" : "text-muted"}>{item.checked ? "✓" : "○"}</span>
                <span className={item.checked ? "" : "text-muted"}>{es && item.textEs ? item.textEs : item.text}</span>
                {multiAssociate && item.checkedBy && <span className="text-xs text-muted">— {item.checkedBy}</span>}
              </div>
            </div>
          );
        })}
        {submission.notes && <p className="mt-2 rounded-lg bg-card-subtle px-2.5 py-2 text-xs text-muted">{submission.notes}</p>}
        {canEdit && (
          <div className="mt-2 border-t border-border pt-2">
            <EditSubmissionDateButton submissionId={submission.id} currentDate={submission.submitted_date} lang={lang} />
          </div>
        )}
      </div>
    </details>
  );
}
