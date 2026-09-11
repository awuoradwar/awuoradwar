// Smoke test -- pptxgenjs's actual slide layout isn't practical to
// assert on line-by-line, so this just proves buildWeeklyReportPptx
// runs to completion against realistic (and edge-case) data shapes and
// produces a real, valid .pptx file every time, not a thrown error or
// a corrupt/empty output.
const { buildWeeklyReportPptx } = require("../weekly-report-pptx");
const { computeWeeklyReportData } = require("../weekly-report-data");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

const ITEMS = {
  1: { id: 1, en: "Are all thermometers calibrated to 32°F?", risk: "low" },
  15: { id: 15, en: "Grilled Teriyaki Chicken >165°F?", risk: "high" },
  16: { id: 16, en: "Walk-in cooler <41°F?", risk: "high" },
  34: { id: 34, en: "Hand sinks stocked with soap and paper towels?", risk: "medium" },
  63: { id: 63, en: "Store free of rodents?", risk: "high" },
};
const findItemDefinitionById = (id) => ITEMS[id] || null;

function sub(storeNumber, date, shift, answers) {
  return { id: `${storeNumber}_${date}_${shift}`, storeNumber, date, shift, conductedBy: "Test Admin", submitted: true, answers };
}

async function checkValidPptx(base64, label) {
  check(typeof base64 === "string" && base64.length > 1000, `${label}: returns a substantial base64 string (got length ${base64?.length})`);
  const buf = Buffer.from(base64, "base64");
  check(buf.slice(0, 2).toString() === "PK", `${label}: decodes to a valid zip/.pptx (PK magic bytes) (got ${JSON.stringify(buf.slice(0, 4).toString())})`);
}

(async () => {
  const from = "2026-09-06";
  const storeNumbers = ["1644", "1651", "1700", "1800", "1985"];

  // ---------- A realistic week: every section has content ----------
  const submissions = [
    sub("1644", "2026-09-06", "opening", {}),
    sub("1651", "2026-09-06", "opening", { "15": { value: "no", note: "Grill running cold" } }),
    sub("1700", "2026-09-07", "opening", { "15": { value: "no" } }),
    sub("1800", "2026-09-06", "opening", { "63": { value: "no" } }),
    sub("1800", "2026-09-08", "closing", { "63": { value: "no" } }),
    sub("1800", "2026-09-09", "opening", { "34": { value: "no" } }),
    sub("1985", "2026-09-06", "midday", { "16": { value: "no", note: "Kale was moved to freezer" } }),
  ];
  const aiFlags = [
    { itemId: "15", reason: "mismatch", storeNumber: "1651", date: "2026-09-06", shift: "opening", conductedBy: "Ana", temperatureF: 142, confidence: "high", expectedOp: ">", expectedThreshold: 165, associateAnswer: "yes" },
    { itemId: "16", reason: "duplicate", storeNumber: "1700", date: "2026-09-07", shift: "midday", conductedBy: "Bo" },
    { itemId: "16", reason: "wrongPhoto", storeNumber: "1985", date: "2026-09-06", shift: "midday", conductedBy: "Cam" },
    { itemId: "15", reason: "unreadable", storeNumber: "2331", date: "2026-09-08", shift: "closing", conductedBy: "Dee" },
  ];
  const data = computeWeeklyReportData({ from, storeNumbers, submissions, aiFlags, findItemDefinitionById });
  const base64 = await buildWeeklyReportPptx(data, "Sep 6 - Sep 12, 2026");
  await checkValidPptx(base64, "Realistic week");

  // ---------- An empty week: no submissions, no AI flags at all ----------
  const emptyData = computeWeeklyReportData({ from, storeNumbers, submissions: [], aiFlags: [], findItemDefinitionById });
  const emptyBase64 = await buildWeeklyReportPptx(emptyData, "Aug 30 - Sep 5, 2026");
  await checkValidPptx(emptyBase64, "Empty week (no data)");

  // ---------- A big week: enough rows to force pagination across multiple slides per section ----------
  const manyStoreNumbers = Array.from({ length: 25 }, (_, i) => String(1000 + i));
  const manySubmissions = manyStoreNumbers.flatMap((s, i) => [
    sub(s, "2026-09-06", "opening", { "1": { value: "no" } }),
    sub(s, "2026-09-07", "opening", { "1": { value: "no" } }), // 2x per store -> a per-store repeat for every store
  ]);
  const bigData = computeWeeklyReportData({ from, storeNumbers: manyStoreNumbers, submissions: manySubmissions, aiFlags: [], findItemDefinitionById });
  check(bigData.repeatByStore.length === 25, `Big-week fixture actually produces enough rows to require pagination (got ${bigData.repeatByStore.length} stores with repeats)`);
  const bigBase64 = await buildWeeklyReportPptx(bigData, "Sep 6 - Sep 12, 2026");
  await checkValidPptx(bigBase64, "Large week (pagination across many slides)");
  check(bigBase64.length > base64.length, `The paginated large deck is a bigger file than the small realistic one (got ${bigBase64.length} vs ${base64.length})`);

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
