// Isolated from index.js (which also wires up firebase-admin/initializeApp)
// so this can be unit-tested with a stub Firestore `db` and no real
// Firebase project involved.
async function checkDuplicate(db, storeNumber, itemId, hash, date, shift, submittedAt, submissionId, associateAnswer) {
  const hashRef = db.collection("photoHashes").doc(`${storeNumber}_${itemId}_${hash}`);
  const existing = await hashRef.get();
  if (existing.exists && existing.data().submissionId !== submissionId) {
    const prior = existing.data();
    return {
      itemId,
      reason: "duplicate",
      duplicateOfDate: prior.date,
      duplicateOfShift: prior.shift ?? null,
      // The exact time the original was submitted -- "same day" alone
      // isn't precise enough when the two submissions are hours apart
      // but land on the same business date.
      duplicateOfSubmittedAt: prior.submittedAt ?? null,
      duplicateOfSubmissionId: prior.submissionId,
      mismatch: false,
      // A reused photo is a photo-evidence problem, independent of
      // whether the associate's own answer was compliant -- keeping the
      // answer here lets the UI reserve High Risk/Critical styling for
      // an actual "No" (a real violation), not every flagged item.
      associateAnswer,
    };
  }
  await hashRef.set({ submissionId, date, shift: shift ?? null, submittedAt: submittedAt ?? null, storeNumber, itemId });
  return null;
}

module.exports = { checkDuplicate };
