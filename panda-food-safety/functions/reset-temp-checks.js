// One-time helper: clears out the temperature-check results written
// while the Cloud Function was still using Haiku 4.5, so a fresh
// `node backfill.js` run re-reads those same photos with Opus 5 instead
// of skipping them as "already checked". Only touches items #3/#15/#16
// (the ones a vision model actually reads) -- duplicate-only flags on
// other items are untouched, since duplicate detection never depended
// on the model and doesn't need re-testing.
//
// Same setup as backfill.js: run locally with GOOGLE_APPLICATION_CREDENTIALS
// pointed at a service account key. No ANTHROPIC_API_KEY needed -- this
// script never calls the API, it only clears Firestore fields.
//
//   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json node reset-temp-checks.js --dry-run
//
// Always run --dry-run first to see how many would be cleared.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { TEMP_CHECK_ITEMS } = require("./temp-check-logic");

const DRY_RUN = process.argv.includes("--dry-run");
const TEMP_ITEM_IDS = Object.keys(TEMP_CHECK_ITEMS);

async function main() {
  initializeApp();
  const db = getFirestore();

  const submissionsSnap = await db.collection("submissions").where("submitted", "==", true).get();

  let submissionsWithClearedFlags = 0;
  let flagFieldsCleared = 0;
  let aiFlaggedDocsDeleted = 0;

  for (const doc of submissionsSnap.docs) {
    const data = doc.data();
    const aiFlags = data.aiFlags || {};
    const idsToClear = TEMP_ITEM_IDS.filter((id) => aiFlags[id]);
    if (idsToClear.length === 0) continue;

    submissionsWithClearedFlags++;
    flagFieldsCleared += idsToClear.length;

    if (!DRY_RUN) {
      const update = {};
      for (const id of idsToClear) update[`aiFlags.${id}`] = FieldValue.delete();
      await db.collection("submissions").doc(doc.id).update(update);
    }

    for (const id of idsToClear) {
      if (!DRY_RUN) {
        await db.collection("aiFlagged").doc(`${doc.id}_${id}`).delete();
      }
      aiFlaggedDocsDeleted++;
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN — nothing cleared" : "RESET COMPLETE"}`);
  console.log(`Submissions with a temp-check flag to clear: ${submissionsWithClearedFlags}`);
  console.log(`Item-level aiFlags fields ${DRY_RUN ? "that would be" : ""} cleared: ${flagFieldsCleared}`);
  console.log(`aiFlagged docs ${DRY_RUN ? "that would be" : ""} deleted: ${aiFlaggedDocsDeleted}`);
  console.log(`\nAfter this, run: node backfill.js  -- to re-check these with Opus 5.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
