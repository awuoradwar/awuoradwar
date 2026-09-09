// Isolated from index.js (which also wires up firebase-admin/initializeApp)
// so this can be unit-tested with a stub Firestore `db` and no real
// Firebase project involved.
async function checkDuplicate(db, storeNumber, itemId, hash, date, submissionId) {
  const hashRef = db.collection("photoHashes").doc(`${storeNumber}_${itemId}_${hash}`);
  const existing = await hashRef.get();
  if (existing.exists && existing.data().submissionId !== submissionId) {
    const prior = existing.data();
    return { itemId, reason: "duplicate", duplicateOfDate: prior.date, duplicateOfSubmissionId: prior.submissionId, mismatch: false };
  }
  await hashRef.set({ submissionId, date, storeNumber, itemId });
  return null;
}

module.exports = { checkDuplicate };
