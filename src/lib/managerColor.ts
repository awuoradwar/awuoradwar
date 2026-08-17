/** A small, deliberately non-token categorical palette used only to tell
 * managers apart at a glance on the Week page (capacity bars, schedule
 * grid) -- distinct from the app's semantic accent/ok/warning/critical
 * tokens, which stay single-meaning everywhere else. Assignment is a stable
 * hash of the manager's id, so the same manager always gets the same color
 * across the whole app without needing to store one. */
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

export function managerColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
