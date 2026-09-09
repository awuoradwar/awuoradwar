// One-time backfill: runs the same checks the live Cloud Function runs
// on new submissions, against every EXISTING submission already in
// Firestore. Not deployed as a Cloud Function — run once, locally, from
// your own machine, against real production data and real API spend.
//
// SETUP (one-time):
//   1. Firebase Console -> Project Settings -> Service Accounts ->
//      Generate new private key. Save the downloaded JSON file
//      somewhere OUTSIDE this repo (never commit it).
//   2. From this functions/ directory:
//        npm install
//        GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
//        ANTHROPIC_API_KEY=sk-ant-... \
//        node backfill.js --dry-run
//
// ALWAYS run --dry-run first. It reports exactly how many submissions,
// how many photos, and how many of those would trigger a real Anthropic
// API call (i.e. cost real money) -- without calling the API or writing
// anything. Only drop --dry-run once those numbers look right to you.
//
// Safe to re-run: an item that already has an aiFlags entry is skipped,
// so a second run (after a partial failure, or to pick up newly
// submitted data) never re-spends on work already done.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");
const { TEMP_CHECK_ITEMS, evaluateTempReading } = require("./temp-check-logic");
const { readTemperatureFromPhoto } = require("./read-temperature");
const { hashPhotoDataUrl } = require("./photo-hash");
const { checkDuplicate } = require("./check-duplicate");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  initializeApp();
  const db = getFirestore();
  const client = DRY_RUN ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const submissionsSnap = await db.collection("submissions").where("submitted", "==", true).get();
  // Oldest first -- duplicate detection must see photos in the order
  // they really happened, so "duplicateOfDate" always names the true
  // original rather than whichever one this script happened to reach first.
  const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date < b.date ? -1 : 1));

  let totalPhotos = 0;
  let alreadyChecked = 0;
  let wouldCallApi = 0;
  let flagsWritten = 0;

  for (const submission of submissions) {
    const photosSnap = await db.collection("submissions").doc(submission.id).collection("photos").get();
    if (photosSnap.empty) continue;

    const existingFlags = submission.aiFlags || {};
    const newFlags = {};

    for (const photoDoc of photosSnap.docs) {
      totalPhotos++;
      const itemId = photoDoc.id;
      if (existingFlags[itemId]) {
        alreadyChecked++;
        continue;
      }

      const dataUrl = photoDoc.data().dataUrl;
      const hash = hashPhotoDataUrl(dataUrl);
      const needsApiCall = Boolean(TEMP_CHECK_ITEMS[itemId] && submission.answers?.[itemId]);
      if (needsApiCall) wouldCallApi++;

      if (DRY_RUN) continue;

      try {
        const dupResult = await checkDuplicate(db, submission.storeNumber, itemId, hash, submission.date, submission.id);
        let result = dupResult;
        if (!result && needsApiCall) {
          const reading = await readTemperatureFromPhoto(client, dataUrl);
          result = evaluateTempReading(itemId, submission.answers[itemId].value, reading);
        }
        if (result) newFlags[itemId] = { ...result, reviewed: false, checkedAt: FieldValue.serverTimestamp() };
      } catch (err) {
        console.error(`Backfill failed for submission ${submission.id}, item ${itemId}:`, err.message);
      }
    }

    if (Object.keys(newFlags).length === 0) continue;
    flagsWritten += Object.keys(newFlags).length;

    await db.collection("submissions").doc(submission.id).set({ aiFlags: newFlags }, { merge: true });
    await Promise.all(
      Object.values(newFlags)
        .filter((flag) => flag.reason)
        .map((flag) =>
          db
            .collection("aiFlagged")
            .doc(`${submission.id}_${flag.itemId}`)
            .set({
              submissionId: submission.id,
              itemId: flag.itemId,
              reason: flag.reason,
              storeNumber: submission.storeNumber,
              date: submission.date,
              shift: submission.shift,
              conductedBy: submission.conductedBy,
              temperatureF: flag.temperatureF ?? null,
              confidence: flag.confidence ?? null,
              expectedOp: flag.expectedOp ?? null,
              expectedThreshold: flag.expectedThreshold ?? null,
              associateAnswer: flag.associateAnswer ?? null,
              duplicateOfDate: flag.duplicateOfDate ?? null,
              duplicateOfSubmissionId: flag.duplicateOfSubmissionId ?? null,
              reviewed: false,
              checkedAt: FieldValue.serverTimestamp(),
            })
        )
    );
  }

  console.log(`\n${DRY_RUN ? "DRY RUN — nothing written, nothing called" : "BACKFILL COMPLETE"}`);
  console.log(`Submissions scanned: ${submissions.length}`);
  console.log(`Photos found: ${totalPhotos}`);
  console.log(`Already checked (skipped): ${alreadyChecked}`);
  console.log(`Would call the Anthropic API: ${wouldCallApi} time(s) (duplicate checks are free, no API call)`);
  if (DRY_RUN) {
    const lowEstimate = (wouldCallApi * 0.002).toFixed(2);
    const highEstimate = (wouldCallApi * 0.01).toFixed(2);
    console.log(`Estimated one-time cost: roughly $${lowEstimate} (Haiku 4.5) to $${highEstimate} (Opus 5)`);
  } else {
    console.log(`New flags written: ${flagsWritten}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
