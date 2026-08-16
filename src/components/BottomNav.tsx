"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const icons: Record<string, React.ReactNode> = {
  shift: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 22V12h6v10M3 10l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" />
    </svg>
  ),
  week: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </svg>
  ),
  add: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  handoff: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 2l4 4-4 4M21 6H9M7 22l-4-4 4-4M3 18h12" />
    </svg>
  ),
  more: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
};

export default function BottomNav({ lang }: { lang: Language }) {
  const pathname = usePathname();
  const items = [
    { href: "/my-shift", key: "nav_my_shift", icon: "shift" },
    { href: "/week", key: "nav_week", icon: "week" },
    { href: "/add", key: "nav_add", icon: "add" },
    { href: "/handoff", key: "nav_handoff", icon: "handoff" },
    { href: "/more", key: "nav_more", icon: "more" },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tap-target relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />}
              {icons[item.icon]}
              <span>{t(lang, item.key as never)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
