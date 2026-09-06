/** The one symbol for "working, not covering the store" (ManagerActivitiesSection's
 * list, ShiftScheduleGrid's badge) -- a plain currentColor stroke icon, not an
 * emoji: a color emoji's own baked-in tones fought with whatever background sits
 * behind it instead of reading as one deliberate color. */
export default function AwayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
