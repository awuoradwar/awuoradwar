import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import {
  getProceduresToken,
  listAllAreas,
  listAllItemsForArea,
  getRecentSubmissions,
  ProcedureCategory,
  ProcedureSubmission,
} from "@/lib/services/procedureService";
import { formatStoreDateTime } from "@/lib/storeTime";
import PageHeader from "@/components/PageHeader";
import ProceduresLinkCard from "@/components/ProceduresLinkCard";
import ProcedureAreasManager from "@/components/ProcedureAreasManager";
import HistoryByWeek from "@/components/HistoryByWeek";

const CATEGORY_LABEL: Record<ProcedureCategory, { en: string; es: string }> = {
  FOH: { en: "Front of House", es: "Área de Clientes" },
  BOH: { en: "Back of House", es: "Área de Cocina" },
  PATIO_WINDOWS: { en: "Patio & Windows", es: "Patio y Ventanas" },
};

function SubmissionRow({ submission, storeId, lang }: { submission: ProcedureSubmission; storeId: string; lang: "en" | "es" }) {
  const es = lang === "es";
  const items = JSON.parse(submission.items_json) as Array<{ text: string; textEs: string | null; checked: boolean }>;
  const checkedCount = items.filter((i) => i.checked).length;
  const locale = es ? "es-MX" : "en-US";

  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {submission.area_name} · {submission.shift_type === "OPENING" ? (es ? "Apertura" : "Opening") : es ? "Cierre" : "Closing"}
          </p>
          <p className="truncate text-xs text-muted">
            {submission.associate_name} · {submission.area_category && CATEGORY_LABEL[submission.area_category][lang]} ·{" "}
            {formatStoreDateTime(storeId, submission.created_at, locale, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold ${checkedCount === items.length ? "text-ok" : "text-warning"}`}>
          {checkedCount}/{items.length}
        </span>
      </summary>
      <div className="flex flex-col gap-1 border-t border-border p-3 text-sm">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={item.checked ? "text-ok" : "text-muted"}>{item.checked ? "✓" : "○"}</span>
            <span className={item.checked ? "" : "text-muted"}>{es && item.textEs ? item.textEs : item.text}</span>
          </div>
        ))}
        {submission.notes && (
          <p className="mt-2 rounded-lg bg-card-subtle px-2.5 py-2 text-xs text-muted">{submission.notes}</p>
        )}
      </div>
    </details>
  );
}

export default async function ProceduresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const es = user.language === "es";
  const canManage = canDo(user, "procedures.manage");

  const token = getProceduresToken(user.storeId);
  let link: string | null = null;
  let qrDataUrl: string | null = null;
  if (token) {
    const h = await headers();
    const host = h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    link = `${proto}://${host}/procedures/${token}`;
    qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 400 });
  }

  const areas = canManage ? listAllAreas(user.storeId) : [];
  const itemsByArea: Record<string, ReturnType<typeof listAllItemsForArea>> = {};
  if (canManage) {
    for (const area of areas) itemsByArea[area.id] = listAllItemsForArea(area.id);
  }

  const submissions = getRecentSubmissions(user.storeId, 100);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={es ? "Procedimientos de Apertura/Cierre" : "Opening/Closing Procedures"} />
      <p className="-mt-3 text-xs text-muted">
        {es
          ? "Los asociados escanean el código QR o abren el enlace en su teléfono, eligen su área y envían la lista -- sin iniciar sesión."
          : "Associates scan the QR code or open the link on their phone, pick their area, and submit the checklist -- no login needed."}
      </p>

      {canManage && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Enlace público" : "Public link"}</h2>
          <div className="card p-4">
            <ProceduresLinkCard link={link} qrDataUrl={qrDataUrl} lang={user.language} />
          </div>
        </section>
      )}

      {canManage && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Estaciones y listas" : "Stations & checklists"}</h2>
          <ProcedureAreasManager areas={areas} itemsByArea={itemsByArea} lang={user.language} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Enviados recientes" : "Recent submissions"}</h2>
        <HistoryByWeek
          items={submissions}
          getDate={(item) => item.submitted_date}
          keyOf={(item) => item.id}
          storeId={user.storeId}
          renderItem={(item) => <SubmissionRow submission={item} storeId={user.storeId} lang={user.language} />}
          lang={user.language}
          emptyLabel={es ? "Nada enviado todavía." : "Nothing submitted yet."}
        />
      </section>
    </div>
  );
}
