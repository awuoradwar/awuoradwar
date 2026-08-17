"use client";

import { useRouter, usePathname } from "next/navigation";
import { ReactNode } from "react";

/** A GET filter/search form that navigates via router.replace instead of a
 * native form submission. A native GET submit pushes a fresh history entry
 * every time, so adjusting filters repeatedly means Back has to be tapped
 * once per adjustment before it actually leaves the page. Replacing instead
 * means Back always exits straight to wherever the user came from. */
export default function FilterForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        const data = new FormData(e.currentTarget);
        for (const [key, value] of data.entries()) {
          const str = String(value).trim();
          if (str) params.set(key, str);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }}
    >
      {children}
    </form>
  );
}
