"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 20000;

/** Re-fetches the current page's server data on a timer so a change made by
 * one manager (on another device) shows up for everyone else without
 * anyone having to pull-to-refresh or restart the app. Pauses while the
 * tab/app is in the background -- no point re-fetching a screen nobody's
 * looking at, and it saves battery/data on a phone. */
export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
