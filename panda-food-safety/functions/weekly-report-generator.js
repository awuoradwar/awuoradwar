// Fires Sunday 00:00 in business time -- i.e. right after Saturday
// 11:59pm, once "this week" is truly over -- builds the slide deck for
// the Sun-Sat week that just ended, uploads it to Cloud Storage, and
// records its metadata in Firestore so the admin dashboard can list and
// download it.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { computeWeeklyReportData } = require("./weekly-report-data");
const { buildWeeklyReportPptx } = require("./weekly-report-pptx");
// Copied in from ../js/checklist-data.js by firebase.json's predeploy
// hook at deploy time -- see that file's own module.exports guard.
const { findItemDefinitionById, applyChecklistOverrides } = require("./checklist-data.js");

// Keep in sync with js/timezone.js's BUSINESS_TIMEZONE.
const BUSINESS_TIMEZONE = "America/Chicago";

function businessTodayDateString() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatWeekLabel(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromStr = new Date(fy, fm - 1, fd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const toStr = new Date(ty, tm - 1, td).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fromStr} - ${toStr}`;
}

// Exported separately from the pure data/pptx-building modules so it
// can be called directly (e.g. a one-off manual run) without waiting
// for Sunday -- see functions/generate-weekly-report-now.js.
async function generateWeeklyReportForWeek(from) {
  const to = addDays(from, 6);
  const weekLabel = formatWeekLabel(from, to);
  const db = getFirestore();

  const [storesSnap, submissionsSnap, aiFlagsSnap, overridesSnap] = await Promise.all([
    db.collection("stores").get(),
    db.collection("submissions").where("date", ">=", from).where("date", "<=", to).get(),
    db.collection("aiFlagged").where("date", ">=", from).where("date", "<=", to).get(),
    db.collection("checklistOverrides").get(),
  ]);

  const overridesMap = {};
  overridesSnap.docs.forEach((d) => (overridesMap[d.id] = d.data()));
  applyChecklistOverrides(overridesMap);

  const storeNumbers = storesSnap.docs.map((d) => d.data().number).sort((a, b) => Number(a) - Number(b));
  const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const aiFlags = aiFlagsSnap.docs.map((d) => d.data());

  const data = computeWeeklyReportData({ from, storeNumbers, submissions, aiFlags, findItemDefinitionById });
  const base64 = await buildWeeklyReportPptx(data, weekLabel);
  const buffer = Buffer.from(base64, "base64");

  const storagePath = `weeklyReports/${from}.pptx`;
  await getStorage()
    .bucket()
    .file(storagePath)
    .save(buffer, { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });

  await db
    .collection("weeklyReports")
    .doc(from)
    .set({
      from,
      to,
      weekLabel,
      generatedAt: FieldValue.serverTimestamp(),
      fileName: `Weekly Report - ${weekLabel}.pptx`,
      storagePath,
      fileSizeBytes: buffer.length,
    });

  return { from, to, weekLabel, storagePath, fileSizeBytes: buffer.length };
}

const generateWeeklyReport = onSchedule({ schedule: "0 0 * * 0", timeZone: BUSINESS_TIMEZONE }, async () => {
  const to = addDays(businessTodayDateString(), -1);
  const from = addDays(to, -6);
  await generateWeeklyReportForWeek(from);
});

module.exports = { generateWeeklyReport, generateWeeklyReportForWeek };
