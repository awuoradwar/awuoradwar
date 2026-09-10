import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import {
  getProceduresToken,
  listActiveAreas,
  listAllAreas,
  listAllItemsForArea,
  getRecentSubmissions,
  getMissedAreasForDate,
  getSubmissionsForDate,
  ProcedureCategory,
} from "@/lib/services/procedureService";
import { storeToday } from "@/lib/storeTime";
import PageHeader from "@/components/PageHeader";
import ProceduresLinkCard from "@/components/ProceduresLinkCard";
import ProcedureAreasManager from "@/components/ProcedureAreasManager";
import ProcedureSubmissionRow from "@/components/ProcedureSubmissionRow";
import HistoryByWeek from "@/components/HistoryByWeek";

function addDaysStr(dateStr: string, days: number): string {
  return new Date(new Date(dateStr + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

const CATEGORY_LABEL: Record<ProcedureCategory, { en: string; es: string }> = {
  FOH: { en: "Front of House", es: "Área de Clientes" },
  BOH: { en: "Back of House", es: "Área de Cocina" },
  PATIO_WINDOWS: { en: "Patio & Windows", es: "Patio y Ventanas" },
};

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

  // "Missed" only ever looks at a day that's fully over -- yesterday, not
  // today, since today's closing simply hasn't happened yet. Opening isn't
  // in use yet (see ProcedureKiosk), so only closing is checked here.
  const today = storeToday(user.storeId);
  const yesterday = addDaysStr(today, -1);
  const missedClosing = new Set(getMissedAreasForDate(user.storeId, yesterday, "CLOSING"));
  // Same "closing" scope, but for today -- gives each station row a real
  // Done/Pending/Missed state instead of only ever flagging a problem, so
  // a glance at this list says what's actually been covered so far today.
  const doneToday = new Set(getSubmissionsForDate(user.storeId, today).filter((s) => s.shift_type === "CLOSING").map((s) => s.area_id));
  const stationsList = listActiveAreas(user.storeId);
  const stationsByCategory = (["FOH", "BOH", "PATIO_WINDOWS"] as ProcedureCategory[])
    .map((c) => ({ category: c, areas: stationsList.filter((a) => a.category === c) }))
    .filter((g) => g.areas.length > 0);
  const doneTodayCount = stationsList.filter((a) => doneToday.has(a.id)).length;

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
          <details className="card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-accent">{es ? "Enlace público" : "Public link"}</span>
              <span className="text-muted">→</span>
            </summary>
            <div className="border-t border-border p-4">
              <ProceduresLinkCard link={link} qrDataUrl={qrDataUrl} lang={user.language} />
            </div>
          </details>
        </section>
      )}

      {stationsByCategory.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Estaciones" : "Stations"}</h2>
          <p className="-mt-1 mb-2 text-xs text-muted">
            {es ? "Toca una estación para ver la semana -- quién la hizo cada día, o si se saltó." : "Tap a station to see its week -- who did it each day, or if it got skipped."}
          </p>
          <div
            className={`mb-3 rounded-xl px-3 py-2 text-sm font-semibold ${
              doneTodayCount === stationsList.length ? "border border-ok/30 bg-ok/5 text-ok" : "border border-accent/30 bg-accent/5 text-accent"
            }`}
          >
            {es ? `${doneTodayCount} de ${stationsList.length} cerradas hoy` : `${doneTodayCount} of ${stationsList.length} closed today`}
          </div>
          <div className="flex flex-col gap-4">
            {stationsByCategory.map((group) => (
              <div key={group.category}>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{CATEGORY_LABEL[group.category][user.language]}</h3>
                <div className="card divide-y divide-border">
                  {group.areas.map((a) => {
                    const done = doneToday.has(a.id);
                    const flagged = !done && missedClosing.has(a.id);
                    return (
                      <Link key={a.id} href={`/more/procedures/${a.id}`} className="tap-target flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-card-subtle">
                        <span>{a.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {done ? (
                            <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">{es ? "✓ Hecho" : "✓ Done"}</span>
                          ) : flagged ? (
                            <span className="rounded-full bg-critical/10 px-2 py-0.5 text-xs font-semibold text-critical">
                              {es ? "⚠ Faltó ayer" : "⚠ Missed yesterday"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-card-subtle px-2 py-0.5 text-xs font-semibold text-muted">{es ? "Pendiente" : "Pending"}</span>
                          )}
                          <span className="text-muted">→</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <section>
          <details className="card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-accent">{es ? "Administrar estaciones y listas" : "Manage stations & checklists"}</span>
              <span className="text-muted">→</span>
            </summary>
            <div className="border-t border-border p-4">
              <ProcedureAreasManager areas={areas} itemsByArea={itemsByArea} lang={user.language} />
            </div>
          </details>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{es ? "Enviados recientes" : "Recent submissions"}</h2>
        <HistoryByWeek
          items={submissions}
          getDate={(item) => item.submitted_date}
          keyOf={(item) => item.id}
          storeId={user.storeId}
          renderItem={(item) => <ProcedureSubmissionRow submission={item} storeId={user.storeId} lang={user.language} canEdit={canManage} />}
          groupByDay
          lang={user.language}
          emptyLabel={es ? "Nada enviado todavía." : "Nothing submitted yet."}
        />
      </section>
    </div>
  );
}
