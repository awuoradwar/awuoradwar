const { computeWeeklyReportData, weekDatesList } = require("../weekly-report-data");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

const ITEMS = {
  1: { id: 1, en: "Are all thermometers calibrated to 32°F?", risk: "low" },
  15: { id: 15, en: "Grilled Teriyaki Chicken >165°F?", risk: "high" },
  16: { id: 16, en: "Walk-in cooler <41°F?", risk: "high" },
  63: { id: 63, en: "Store free of rodents?", risk: "high" },
};
const findItemDefinitionById = (id) => ITEMS[id] || null;

function sub(storeNumber, date, shift, answers, submitted = true) {
  return { id: `${storeNumber}_${date}_${shift}`, storeNumber, date, shift, conductedBy: "Test", submitted, answers };
}

(async () => {
  const from = "2026-09-06"; // a Sunday
  const weekDates = weekDatesList(from);
  check(weekDates.length === 7 && weekDates[0] === "2026-09-06" && weekDates[6] === "2026-09-12", `weekDatesList produces the 7 Sun-Sat dates (got ${JSON.stringify(weekDates)})`);

  const submissions = [
    // 1644: all 3 shifts submitted on day 0 -> 1 fully-done day. No flags.
    sub("1644", weekDates[0], "opening", {}),
    sub("1644", weekDates[0], "midday", {}),
    sub("1644", weekDates[0], "closing", {}),
    // 1651: item 1 flagged once (day 0) -- contributes to cross-store trending with 1700, but not a per-store repeat.
    sub("1651", weekDates[0], "opening", { "1": { value: "no", note: "Broken thermometer" } }),
    // 1700: item 1 flagged once too (day 1) -- together with 1651, item 1 is now trending (2 distinct stores).
    sub("1700", weekDates[1], "opening", { "1": { value: "no" } }),
    // 1800: item 63 (High Risk) flagged TWICE at the same store -- a per-store repeat, but at only 1 store (not trending).
    sub("1800", weekDates[0], "opening", { "63": { value: "no" } }),
    sub("1800", weekDates[2], "closing", { "63": { value: "no" } }),
    // An unsubmitted (in-progress) draft with a repeated flag -- must not count toward anything.
    sub("1800", weekDates[3], "midday", { "63": { value: "no" } }, false),
  ];

  const aiFlags = [
    { itemId: "15", reason: "mismatch", storeNumber: "1651", date: weekDates[0], shift: "opening", conductedBy: "Ana", temperatureF: 142 },
    { itemId: "16", reason: "duplicate", storeNumber: "1700", date: weekDates[1], shift: "midday", conductedBy: "Bo" },
    { itemId: "16", reason: "wrongPhoto", storeNumber: "1800", date: weekDates[0], shift: "opening", conductedBy: "Cam" },
    { itemId: "15", reason: "unreadable", storeNumber: "1644", date: weekDates[2], shift: "closing", conductedBy: "Dee" },
  ];

  const storeNumbers = ["1644", "1651", "1700", "1800"];
  const data = computeWeeklyReportData({ from, storeNumbers, submissions, aiFlags, findItemDefinitionById });

  // ---------- Store completion ----------
  const c1644 = data.storeCompletion.find((r) => r.storeNumber === "1644");
  check(c1644.doneDays === 1, `1644 has exactly 1 fully-done day (all 3 shifts on day 0) (got ${c1644.doneDays})`);
  check(data.fullyCompliantCount === 0, `No store hit 7/7 days -- fullyCompliantCount is 0 (got ${data.fullyCompliantCount})`);
  check(data.totalStores === 4, `totalStores reflects the store list passed in (got ${data.totalStores})`);

  // ---------- Cross-store trending ----------
  check(data.trending.length === 1, `Exactly one item is trending across stores (item 1) (got ${JSON.stringify(data.trending.map((t) => t.item.id))})`);
  check(data.trending[0].item.id === 1, `The trending item is item 1 (got ${data.trending[0]?.item.id})`);
  check(data.trending[0].storeEntries.length === 2, `Item 1 is trending across exactly 2 stores (got ${data.trending[0].storeEntries.length})`);
  check(data.trending[0].totalCount === 2, `Item 1's total count across both stores is 2 (got ${data.trending[0].totalCount})`);

  // ---------- Repeat violations by store ----------
  check(data.repeatByStore.length === 1, `Exactly one store has a per-store repeat (1800) (got ${JSON.stringify(data.repeatByStore.map((r) => r.storeNumber))})`);
  check(data.repeatByStore[0].storeNumber === "1800", `The repeat-violation store is 1800 (got ${data.repeatByStore[0]?.storeNumber})`);
  check(data.repeatByStore[0].items[0].count === 2, `1800's repeat item (63) shows count 2 -- the unsubmitted draft is NOT counted (got ${data.repeatByStore[0].items[0]?.count})`);
  check(data.totalRepeat === 1, `totalRepeat counts 1 repeat-violation row total (got ${data.totalRepeat})`);

  // ---------- All flagged items ----------
  check(data.totalFlagged === 4, `4 total flagged "no" answers across all stores this week (1651, 1700, 1800 x2) (got ${data.totalFlagged})`);
  const flagged1651 = data.allFlagged.find((r) => r.storeNumber === "1651");
  check(flagged1651.rows[0].note === "Broken thermometer", `A flagged item's note carries through to the report data (got ${JSON.stringify(flagged1651?.rows[0])})`);

  // ---------- AI flags by reason ----------
  check(data.totalAiFlags === 4, `totalAiFlags reflects every seeded flag (got ${data.totalAiFlags})`);
  check(Object.keys(data.aiFlagsByReason).sort().join(",") === "duplicate,mismatch,unreadable,wrongPhoto", `AI flags are grouped into all 4 reason buckets (got ${JSON.stringify(Object.keys(data.aiFlagsByReason))})`);
  check(data.aiFlagsByReason.mismatch[0].item.id === 15, `A mismatch flag's item lookup resolves correctly (got ${data.aiFlagsByReason.mismatch[0]?.item?.id})`);

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
