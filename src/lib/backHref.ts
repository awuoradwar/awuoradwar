/** Resolves the back-destination for a detail page reachable from more than
 * one list/section (task, issue, borrowed item, attendance event, meal
 * replacement). Every Link that navigates INTO one of these pages appends
 * `?from=<its own path>` (see withFrom below); the detail page reads it back
 * out here and falls through to a sensible static default when it's absent
 * -- a direct deep link, a bookmark, or a notification tap never carries one.
 *
 * Only ever returns an internal path: an untrusted `from` value that doesn't
 * start with a single `/` (blocks `//evil.com`-style protocol-relative
 * redirects) is discarded in favor of the fallback.
 */
export function resolveBackHref(from: string | string[] | undefined, fallback: string): string {
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : fallback;
}

/** Appends the current page's own path as `?from=` onto a Link headed into
 * one of the multi-entry-point detail pages above, so its back button can
 * return here instead of a single hardcoded default. */
export function withFrom(href: string, from: string): string {
  return `${href}?from=${encodeURIComponent(from)}`;
}
