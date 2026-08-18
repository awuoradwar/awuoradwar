/** A small, deliberately non-token categorical palette used only to tell
 * managers apart at a glance on the Week page (capacity bars, schedule
 * grid) -- distinct from the app's semantic accent/ok/warning/critical
 * tokens, which stay single-meaning everywhere else. */
const PALETTE: Array<{ bg: string; text: string; dot: string }> = [
  { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" }, // blue
  { bg: "#ede9fe", text: "#7c3aed", dot: "#8b5cf6" }, // purple
  { bg: "#ccfbf1", text: "#0f766e", dot: "#14b8a6" }, // teal
  { bg: "#fce7f3", text: "#be185d", dot: "#ec4899" }, // pink
  { bg: "#e0e7ff", text: "#4338ca", dot: "#6366f1" }, // indigo
  { bg: "#cffafe", text: "#0e7490", dot: "#06b6d4" }, // cyan
  { bg: "#ffe4e6", text: "#be123c", dot: "#f43f5e" }, // rose
  { bg: "#f1f5f9", text: "#334155", dot: "#64748b" }, // slate
];

export type ManagerColor = (typeof PALETTE)[number];

/** Assigns each manager a distinct palette color for as long as the store
 * has 8 or fewer active managers (every real store does) -- colors are
 * picked by each manager's position in the id-sorted roster, not by
 * per-id hashing, so two different managers can never land on the same
 * color the way a plain hash occasionally collided. Sorting by id keeps
 * the assignment stable across page loads regardless of fetch order, so a
 * given manager keeps the same color everywhere as long as the roster
 * itself doesn't change. */
export function buildManagerColorMap(managerIds: string[]): Map<string, ManagerColor> {
  const sorted = [...new Set(managerIds)].sort();
  const map = new Map<string, ManagerColor>();
  sorted.forEach((id, i) => map.set(id, PALETTE[i % PALETTE.length]));
  return map;
}
