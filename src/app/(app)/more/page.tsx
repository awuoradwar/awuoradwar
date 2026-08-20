import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { t } from "@/lib/i18n";
import NavIcon, { ICON_PATHS } from "@/components/NavIcon";

export default async function MorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  const groups: Array<{ label: string; items: Array<{ href: string; key: string; icon: string }> }> = [
    {
      label: lang === "es" ? "Operaciones diarias" : "Daily Operations",
      items: [
        { href: "/more/work-orders", key: "more_work_orders", icon: "wrench" },
        { href: "/more/meal-replacements", key: "more_meal_replacements", icon: "utensils" },
        { href: "/more/cleaning", key: "more_cleaning", icon: "sparkle" },
        { href: "/more/acknowledgements", key: "more_acknowledgements", icon: "checkCircle" },
        { href: "/more/training", key: "more_training", icon: "graduationCap" },
        { href: "/more/inventory", key: "more_inventory", icon: "box" },
        { href: "/more/scheduling", key: "more_scheduling", icon: "calendar" },
        { href: "/more/catering", key: "more_catering", icon: "users" },
        { href: "/more/borrowed-items", key: "more_borrowed_items", icon: "swap" },
      ],
    },
    {
      label: lang === "es" ? "Registros y planeación" : "Records & Planning",
      items: [
        { href: "/more/search", key: "more_search", icon: "search" },
        { href: "/more/store-profile", key: "more_store_profile", icon: "storefront" },
        { href: "/more/weekly-summary", key: "more_weekly_summary", icon: "trendingUp" },
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
                    <NavIcon path={ICON_PATHS[item.icon]} />
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
