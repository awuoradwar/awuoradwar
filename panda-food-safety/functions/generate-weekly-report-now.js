// One-time/manual trigger: runs the exact same weekly report generation
// the Sunday-midnight schedule runs, for an explicit week -- useful to
// test right away instead of waiting for Sunday, or to backfill a week
// that was missed.
//
//   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json node generate-weekly-report-now.js [YYYY-MM-DD-of-a-Sunday]
//
// Defaults to LAST week (the most recently fully-completed Sun-Sat
// week) if no date is given.
const fs = require("fs");
const path = require("path");

// The real deploy copies js/checklist-data.js in here via firebase.json's
// predeploy hook; running this locally needs that same copy, so do it
// here too if it isn't already present.
const copiedChecklistPath = path.join(__dirname, "checklist-data.js");
if (!fs.existsSync(copiedChecklistPath)) {
  fs.copyFileSync(path.join(__dirname, "..", "js", "checklist-data.js"), copiedChecklistPath);
}

const { initializeApp } = require("firebase-admin/app");
const { generateWeeklyReportForWeek } = require("./weekly-report-generator");

function lastSunday() {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay() - 7);
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
}

async function main() {
  initializeApp();
  const from = process.argv[2] || lastSunday();
  console.log(`Generating weekly report for the week starting ${from}...`);
  const result = await generateWeeklyReportForWeek(from);
  console.log("\nDone:");
  console.log(result);
  console.log(`\nCheck the admin dashboard's Weekly Report tab for "${result.weekLabel}" to download it.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
