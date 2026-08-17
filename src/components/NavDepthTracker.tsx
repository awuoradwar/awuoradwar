"use client";

import { useEffect } from "react";

const KEY = "appEntryHistoryLength";

/** Records how deep the browser history stack was when this tab first
 * arrived in the app. PageHeader's back button compares the current depth
 * against this baseline to tell "we navigated here from another in-app
 * page" (safe to router.back()) apart from "this is where the tab/deep-link
 * landed" (no in-app page to go back to, fall back to a static href). */
export default function NavDepthTracker() {
  useEffect(() => {
    if (!sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, String(window.history.length));
    }
  }, []);
  return null;
}
