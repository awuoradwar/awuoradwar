import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import NavIcon, { ICON_PATHS } from "@/components/NavIcon";

// Cleaning, Meal Replacement, Issue (Work Order), and Acknowledgement each
// have their own dedicated management page under More -- one home per
// feature, so More doesn't grow entries that duplicate what's already
// reachable from here. Catering and Borrowed/Lent live here instead: not
// under More at all, so More stays uncluttered, and this entry point goes
// straight to their full page (add button + open/history), not just a
// bare add form -- one tap reaches everything for that feature.
// Grouped and styled the same as the More menu (accent group label, card of
// icon rows) rather than a standalone tile grid, so every "list of things
// you can go do" screen in the app reads as one consistent system.
const GROUPS = [
  {
    labelKey: "quick_log_group_staffing",
    items: [
      { slug: "call-in", key: "add_call_in", icon: "phone" },
      { slug: "late", key: "add_late", icon: "clock" },
    ],
  },
  {
    labelKey: "quick_log_group_shift",
    items: [
      { slug: "task", key: "add_task", icon: "checkCircle" },
      { slug: "catering", key: "add_catering", icon: "users", href: "/more/catering" },
      { slug: "borrowed-item", key: "add_borrowed_item", icon: "swap", href: "/more/borrowed-items" },
      { slug: "note", key: "add_note", icon: "fileText" },
    ],
  },
] as const;

export default async function AddPickerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = user.language;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-4 text-lg font-semibold">{t(lang, "nav_add")}</h1>
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <section key={group.labelKey}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{t(lang, group.labelKey as never)}</h2>
            <div className="card divide-y divide-border">
              {group.items.map((item) => (
                <Link
                  key={item.slug}
                  href={"href" in item ? item.href : `/add/${item.slug}`}
                  className="tap-target flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-card-subtle"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <NavIcon path={ICON_PATHS[item.icon]} />
                  </span>
                  <span className="flex-1">{t(lang, item.key as never)}</span>
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
