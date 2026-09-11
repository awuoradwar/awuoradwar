// One-time helper: the shift/time shown on a duplicate-photo flag is
// copied from the ORIGINAL photo's registration at the moment the
// duplicate is detected -- so any flag whose original was registered
// before that tracking existed has nothing to copy, and keeps showing
// the bare "Same photo used on {date}." wording forever, even after
// the fix shipped. This backfills the missing shift/submittedAt onto:
//   1. photoHashes docs (using each doc's own recorded submissionId) --
//      fixes future duplicates checked against these old registrations.
//   2. existing aiFlagged docs with reason:"duplicate" (using their
//      recorded duplicateOfSubmissionId) -- fixes what's ALREADY shown
//      in the Flagged Photos list right now, plus the matching entry in
//      the flagged submission's own aiFlags map (what the focused View
//      modal reads).
//
// Same setup as backfill.js: run locally with GOOGLE_APPLICATION_CREDENTIALS
// pointed at a service account key. No ANTHROPIC_API_KEY needed -- this
// script never calls the API, it only patches Firestore fields.
//
//   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json node backfill-duplicate-shift.js --dry-run
//
// Always run --dry-run first to see how many would be patched.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  initializeApp();
  const db = getFirestore();

  // Submissions get looked up repeatedly (the same original photo can be
  // the source of many later duplicates) -- cache them.
  const submissionCache = new Map();
  async function getSubmission(id) {
    if (submissionCache.has(id)) return submissionCache.get(id);
    const snap = await db.collection("submissions").doc(id).get();
    const data = snap.exists ? snap.data() : null;
    submissionCache.set(id, data);
    return data;
  }

  // ---------- photoHashes: registrations missing shift/submittedAt ----------
  const hashesSnap = await db.collection("photoHashes").get();
  let hashesPatched = 0;
  let hashesSkipped = 0;
  for (const doc of hashesSnap.docs) {
    const data = doc.data();
    if (data.shift !== undefined && data.submittedAt !== undefined) {
      hashesSkipped++;
      continue;
    }
    const submission = await getSubmission(data.submissionId);
    if (!submission) {
      hashesSkipped++;
      continue;
    }
    hashesPatched++;
    if (!DRY_RUN) {
      await doc.ref.set({ shift: submission.shift ?? null, submittedAt: submission.submittedAt ?? null }, { merge: true });
    }
  }

  // ---------- aiFlagged: existing duplicate flags missing the original's shift/submittedAt ----------
  const flagsSnap = await db.collection("aiFlagged").where("reason", "==", "duplicate").get();
  let flagsPatched = 0;
  let flagsSkipped = 0;
  for (const doc of flagsSnap.docs) {
    const data = doc.data();
    if (data.duplicateOfShift || data.duplicateOfSubmittedAt || !data.duplicateOfSubmissionId) {
      flagsSkipped++;
      continue;
    }
    const original = await getSubmission(data.duplicateOfSubmissionId);
    if (!original) {
      flagsSkipped++;
      continue;
    }
    flagsPatched++;
    if (!DRY_RUN) {
      const patch = { duplicateOfShift: original.shift ?? null, duplicateOfSubmittedAt: original.submittedAt ?? null };
      await doc.ref.set(patch, { merge: true });
      // Also patch the flagged submission's own aiFlags map entry --
      // that's what the focused "View" detail modal reads, separate
      // from the denormalized aiFlagged doc the list itself reads.
      await db
        .collection("submissions")
        .doc(data.submissionId)
        .set({ aiFlags: { [data.itemId]: patch } }, { merge: true });
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN — nothing patched" : "BACKFILL COMPLETE"}`);
  console.log(`photoHashes: ${hashesPatched} patched, ${hashesSkipped} already had it or no match`);
  console.log(`aiFlagged (duplicate): ${flagsPatched} patched, ${flagsSkipped} already had it or no match`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
