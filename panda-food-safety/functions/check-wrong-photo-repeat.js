// Separate from checkDuplicate (which only catches the exact same photo
// FILE reused) -- this catches the broader pattern of an item repeatedly
// getting a wrong photo at all, even a different photo each time (e.g. a
// different produce shot every day, none of them the requested
// thermometer reading). Isolated from index.js like check-duplicate.js
// so it can be unit-tested with a stub Firestore `db`.
async function checkWrongPhotoRepeat(db, storeNumber, itemId, date, shift, submittedAt, submissionId) {
  const trackingRef = db.collection("wrongPhotoTracking").doc(`${storeNumber}_${itemId}`);
  const existing = await trackingRef.get();
  const prior = existing.exists && existing.data().submissionId !== submissionId ? existing.data() : null;

  await trackingRef.set({ submissionId, date, shift: shift ?? null, submittedAt: submittedAt ?? null, storeNumber, itemId });

  if (!prior) return null;
  return {
    priorWrongPhotoDate: prior.date,
    priorWrongPhotoShift: prior.shift ?? null,
    priorWrongPhotoSubmittedAt: prior.submittedAt ?? null,
    priorWrongPhotoSubmissionId: prior.submissionId,
  };
}

module.exports = { checkWrongPhotoRepeat };
