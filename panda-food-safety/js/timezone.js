// The stores all operate on one fixed business timezone, not whatever
// timezone an associate's or admin's device happens to be set to — so
// "today" and "this week" must mean the same calendar day/week no matter
// where someone is standing when they open the app.
const BUSINESS_TIMEZONE = "America/Chicago";

// Returns a Date object whose local getters (getFullYear/getMonth/
// getDate/getDay/getHours/...) read as the current wall-clock time in
// BUSINESS_TIMEZONE, so ordinary date-arithmetic code keeps working
// unchanged while actually being anchored to Central Time.
//
// Only use this for arithmetic (day/week boundaries, "is it a new day
// yet"). To *display* an already-known absolute instant (a Firestore
// timestamp like submittedAt), pass `timeZone: BUSINESS_TIMEZONE`
// straight to toLocaleString/toLocaleDateString instead — combining
// both techniques on the same value would shift it twice.
function nowInBusinessTZ() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
