// One-time local report: prints every temperature-check result recorded
// on submissions (items #3/#15/#16), not just the ones flagged as a
// mismatch -- so you can spot-check the AI's reading against the real
// photo for a sample of PASSING checks too, not only the failures. A
// model that's wrong roughly as often on "agrees with the answer" cases
// as on flagged ones is a real accuracy problem, even if nothing shows
// up in the flags list.
//
// Same setup as backfill.js -- run locally with GOOGLE_APPLICATION_CREDENTIALS
// pointed at a service account key. No ANTHROPIC_API_KEY needed, this
// only reads Firestore.
//
//   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json node report-temp-checks.js
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { TEMP_CHECK_ITEMS } = require("./temp-check-logic");

async function main() {
  initializeApp();
  const db = getFirestore();

  const submissionsSnap = await db.collection("submissions").where("submitted", "==", true).get();
  const rows = [];

  for (const doc of submissionsSnap.docs) {
    const data = doc.data();
    const aiFlags = data.aiFlags || {};
    for (const itemId of Object.keys(TEMP_CHECK_ITEMS)) {
      const flag = aiFlags[itemId];
      if (!flag) continue;
      rows.push({
        submissionId: doc.id,
        storeNumber: data.storeNumber,
        date: data.date,
        shift: data.shift || "(legacy)",
        itemId,
        readable: flag.readable,
        temperatureF: flag.temperatureF ?? "—",
        confidence: flag.confidence ?? "—",
        associateAnswer: flag.associateAnswer,
        mismatch: flag.mismatch,
      });
    }
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.storeNumber) - Number(b.storeNumber)));

  console.log(`\nTotal temperature-check results: ${rows.length}\n`);
  console.log("date       | store | item | read      | conf   | answer | mismatch | submissionId");
  console.log("-".repeat(90));
  for (const r of rows) {
    console.log(
      `${r.date} | ${String(r.storeNumber).padEnd(5)} | ${r.itemId.padEnd(4)} | ${String(r.temperatureF).padEnd(9)} | ${String(r.confidence).padEnd(6)} | ${String(r.associateAnswer).padEnd(6)} | ${String(r.mismatch).padEnd(8)} | ${r.submissionId}`
    );
  }
  console.log(`\nTo spot-check: pick a few rows above, then in the admin dashboard go to History,`);
  console.log(`find that store + date, open it, and compare the "read" value to the actual photo for that item.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
