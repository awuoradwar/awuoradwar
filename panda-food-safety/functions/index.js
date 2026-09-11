const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");
const { TEMP_CHECK_ITEMS, evaluateTempReading } = require("./temp-check-logic");
const { readTemperatureFromPhoto } = require("./read-temperature");
const { hashPhotoDataUrl } = require("./photo-hash");
const { checkDuplicate } = require("./check-duplicate");
const { checkWrongPhotoRepeat } = require("./check-wrong-photo-repeat");
const { generateWeeklyReport } = require("./weekly-report-generator");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Fires whenever a submission doc is written. Only acts the moment
// `submitted` transitions from false/absent to true — never re-runs on
// later admin edits (e.g. the conductedBy handoff/rename flow), and
// never runs on in-progress drafts that get retaken before submitting.
exports.checkSubmissionPhotos = onDocumentWritten(
  { document: "submissions/{submissionId}", secrets: [anthropicApiKey] },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after || after.submitted !== true || before?.submitted === true) return;

    const db = getFirestore();
    const submissionRef = db.collection("submissions").doc(event.params.submissionId);
    const photosSnap = await submissionRef.collection("photos").get();
    if (photosSnap.empty) return;

    const answers = after.answers || {};
    let client = null;

    const results = await Promise.all(
      photosSnap.docs.map(async (photoDoc) => {
        const itemId = photoDoc.id;
        try {
          const dataUrl = photoDoc.data().dataUrl;
          const hash = hashPhotoDataUrl(dataUrl);

          // A reused photo is conclusive on its own — don't also spend an
          // API call reading a temperature off it.
          const dupResult = await checkDuplicate(db, after.storeNumber, itemId, hash, after.date, after.shift ?? null, after.submittedAt ?? null, event.params.submissionId);
          if (dupResult) return dupResult;

          if (TEMP_CHECK_ITEMS[itemId] && answers[itemId]) {
            client = client || new Anthropic({ apiKey: anthropicApiKey.value() });
            const reading = await readTemperatureFromPhoto(client, dataUrl);
            const result = evaluateTempReading(itemId, answers[itemId].value, reading);

            // A wrong photo (doesn't show what was asked at all) is worth
            // knowing is a REPEAT even when it's not byte-identical to a
            // prior one -- checkDuplicate only catches the exact same
            // file reused, not "a different photo, but still the wrong
            // thing, again."
            if (result?.reason === "wrongPhoto") {
              const repeatInfo = await checkWrongPhotoRepeat(db, after.storeNumber, itemId, after.date, after.shift ?? null, after.submittedAt ?? null, event.params.submissionId);
              if (repeatInfo) return { ...result, ...repeatInfo };
            }
            return result;
          }
          return null;
        } catch (err) {
          console.error(`Photo check failed for item ${itemId}:`, err);
          return null;
        }
      })
    );

    const aiFlags = {};
    for (const result of results) {
      if (!result) continue;
      aiFlags[result.itemId] = { ...result, reviewed: false, checkedAt: FieldValue.serverTimestamp() };
    }
    if (Object.keys(aiFlags).length === 0) return;

    await submissionRef.set({ aiFlags }, { merge: true });

    // Denormalized so the admin dashboard's notification badge can query
    // "unresolved flags" cheaply (a handful of docs, growing only with
    // real flags) instead of scanning every submission — the same
    // lesson this app already learned twice with Today's Status.
    const writes = Object.values(aiFlags)
      .filter((flag) => flag.reason)
      .map((flag) =>
        db
          .collection("aiFlagged")
          .doc(`${event.params.submissionId}_${flag.itemId}`)
          .set({
            submissionId: event.params.submissionId,
            itemId: flag.itemId,
            reason: flag.reason,
            storeNumber: after.storeNumber,
            date: after.date,
            shift: after.shift ?? null,
            conductedBy: after.conductedBy,
            temperatureF: flag.temperatureF ?? null,
            confidence: flag.confidence ?? null,
            expectedOp: flag.expectedOp ?? null,
            expectedThreshold: flag.expectedThreshold ?? null,
            associateAnswer: flag.associateAnswer ?? null,
            duplicateOfDate: flag.duplicateOfDate ?? null,
            duplicateOfShift: flag.duplicateOfShift ?? null,
            duplicateOfSubmittedAt: flag.duplicateOfSubmittedAt ?? null,
            duplicateOfSubmissionId: flag.duplicateOfSubmissionId ?? null,
            priorWrongPhotoDate: flag.priorWrongPhotoDate ?? null,
            priorWrongPhotoShift: flag.priorWrongPhotoShift ?? null,
            priorWrongPhotoSubmittedAt: flag.priorWrongPhotoSubmittedAt ?? null,
            priorWrongPhotoSubmissionId: flag.priorWrongPhotoSubmissionId ?? null,
            reviewed: false,
            checkedAt: FieldValue.serverTimestamp(),
          })
      );
    await Promise.all(writes);
  }
);
