"use client";

import { useCallback, useRef } from "react";

/** Some iOS Safari builds scroll the whole page back to the top when a
 * <details> toggles open/closed, or when router.refresh() swaps in a fresh
 * server-rendered tree -- not reproducible in Chromium, but a well-known
 * WebKit quirk, and exactly what shows up as "opening/saving a template
 * jumps me back to the top of the list."
 *
 * capture() reads the current scroll position; restore() forces it back.
 * There's no reliable hook for "the moment WebKit's own scroll-jump
 * happens" (it can land before or after a transition/refresh actually
 * commits), so restore fires several times over the next beat -- cheap and
 * harmless if the page never moved, effective whenever it did. */
export function usePreservedScroll() {
  const yRef = useRef(0);

  const capture = useCallback(() => {
    yRef.current = window.scrollY;
  }, []);

  const restore = useCallback(() => {
    const y = yRef.current;
    const set = () => window.scrollTo(0, y);
    requestAnimationFrame(set);
    [50, 150, 350, 700].forEach((ms) => setTimeout(set, ms));
  }, []);

  return { capture, restore };
}
