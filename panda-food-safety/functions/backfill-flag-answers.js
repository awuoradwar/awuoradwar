// One-time helper: only a "mismatch" flag used to record the
// associate's own answer -- a duplicate/wrongPhoto/unreadable flag
// never did, since nothing needed it before. High Risk/Critical styling
// now only applies when the associate's answer was actually "No" (a
// flagged item they answered "Yes" to is a photo-evidence problem, not
// a confirmed violation) -- so any existing duplicate/wrongPhoto/
// unreadable flag with no recorded answer reads as "not critical" by
// default, even ones that genuinely were "No". This backfills the
// missing associateAnswer onto:
//   1. existing aiFlagged docs (reason duplicate/wrongPhoto/unreadable)
//      missing it -- using the flagged submission's own recorded answer
//      for that item.
//   2. the matching entry in that submission's own aiFlags map (what
//      the focused View modal reads).
//
// Same setup as backfill.js: run locally with GOOGLE_APPLICATION_CREDENTIALS
// pointed at a service account key. No ANTHROPIC_API_KEY needed -- this
// script never calls the API, it only patches Firestore fields.
//
//   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json node backfill-flag-answers.js --dry-run
//
// Always run --dry-run first to see how many would be patched.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DRY_RUN = process.argv.includes("--dry-run");
const REASONS_MISSING_ANSWER = ["duplicate", "wrongPhoto", "unreadable"];

async function main() {
  initializeApp();
  const db = getFirestore();

  const submissionCache = new Map();
  async function getSubmission(id) {
    if (submissionCache.has(id)) return submissionCache.get(id);
    const snap = await db.collection("submissions").doc(id).get();
    const data = snap.exists ? snap.data() : null;
    submissionCache.set(id, data);
    return data;
  }

  const flagsSnap = await db.collection("aiFlagged").where("reason", "in", REASONS_MISSING_ANSWER).get();
  let patched = 0;
  let skipped = 0;
  for (const doc of flagsSnap.docs) {
    const data = doc.data();
    if (data.associateAnswer !== undefined) {
      skipped++;
      continue;
    }
    const submission = await getSubmission(data.submissionId);
    const answer = submission?.answers?.[data.itemId]?.value ?? null;
    if (answer === null) {
      skipped++;
      continue;
    }
    patched++;
    if (!DRY_RUN) {
      await doc.ref.set({ associateAnswer: answer }, { merge: true });
      // Also patch the flagged submission's own aiFlags map entry --
      // that's what the focused "View" detail modal reads, separate
      // from the denormalized aiFlagged doc the list itself reads.
      await db
        .collection("submissions")
        .doc(data.submissionId)
        .set({ aiFlags: { [data.itemId]: { associateAnswer: answer } } }, { merge: true });
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN — nothing patched" : "BACKFILL COMPLETE"}`);
  console.log(`aiFlagged (duplicate/wrongPhoto/unreadable): ${patched} patched, ${skipped} already had it or no match`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
