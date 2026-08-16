import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { t } from "@/lib/i18n";

function Icon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const ICON_PATHS: Record<string, string> = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35",
  wrench: "M14.7 6.3a4 4 0 0 0-5.66 5.66L3 18v3h3l6.04-6.04a4 4 0 0 0 5.66-5.66l-2.83 2.83-2.12-2.12 2.83-2.83Z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  checkCircle: "M8 12.5 11 15l5-6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  calendar: "M3 10h18M8 2v4M16 2v4M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  chart: "M3 3v18h18M8 17V10M13 17V6M18 17v-4",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z",
  layers: "m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  shield: "M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z",
  storefront: "M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M2 9l1.5-5h17L22 9M2 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M9 21v-6h6v6",
};

export default async function MorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const groups: Array<{ label: string; items: Array<{ href: string; key: string; icon: string }> }> = [
    {
      label: lang === "es" ? "Operaciones diarias" : "Daily Operations",
      items: [
        { href: "/more/work-orders", key: "more_work_orders", icon: "wrench" },
        { href: "/more/cleaning", key: "more_cleaning", icon: "sparkle" },
        { href: "/more/acknowledgements", key: "more_acknowledgements", icon: "checkCircle" },
        { href: "/more/scheduling", key: "more_scheduling", icon: "calendar" },
      ],
    },
    {
      label: lang === "es" ? "Registros y planeación" : "Records & Planning",
      items: [
        { href: "/more/search", key: "more_search", icon: "search" },
        { href: "/more/store-profile", key: "more_store_profile", icon: "storefront" },
        { href: "/more/reports", key: "more_reports", icon: "chart" },
        { href: "/more/inbox", key: "more_inbox", icon: "inbox" },
        { href: "/more/templates", key: "more_templates", icon: "layers" },
      ],
    },
    {
      label: lang === "es" ? "Sistema" : "System",
      items: [
        { href: "/more/settings", key: "more_settings", icon: "gear" },
        ...(isGM(user) ? [{ href: "/more/admin", key: "more_admin", icon: "shield" }] : []),
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-4 text-lg font-semibold">{t(user.language, "nav_more")}</h1>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{group.label}</h2>
            <div className="card divide-y divide-border">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="tap-target flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-card-subtle">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Icon path={ICON_PATHS[item.icon]} />
                  </span>
                  <span className="flex-1">{t(user.language, item.key as never)}</span>
                  <span className="text-muted">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
