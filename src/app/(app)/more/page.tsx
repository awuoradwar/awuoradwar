import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isGM } from "@/lib/permissions";
import { t } from "@/lib/i18n";

export default async function MorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = [
    { href: "/more/search", key: "more_search", icon: "🔎" },
    { href: "/more/store-profile", key: "more_store_profile", icon: "🐼" },
    { href: "/more/cleaning", key: "more_cleaning", icon: "🧹" },
    { href: "/more/acknowledgements", key: "more_acknowledgements", icon: "✅" },
    { href: "/more/scheduling", key: "more_scheduling", icon: "🗓️" },
    { href: "/more/inbox", key: "more_inbox", icon: "📥" },
    { href: "/more/reports", key: "more_reports", icon: "📊" },
    { href: "/more/templates", key: "more_templates", icon: "🧩" },
    { href: "/more/settings", key: "more_settings", icon: "⚙️" },
    ...(isGM(user) ? [{ href: "/more/admin", key: "more_admin", icon: "🛡️" } as const] : []),
  ];

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-4 text-lg font-semibold">{t(user.language, "nav_more")}</h1>
      <div className="card divide-y divide-border">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="tap-target flex items-center gap-3 px-4 py-3 text-sm font-medium">
            <span className="text-lg">{item.icon}</span>
            {t(user.language, item.key as never)}
          </Link>
        ))}
      </div>
    </div>
  );
}
