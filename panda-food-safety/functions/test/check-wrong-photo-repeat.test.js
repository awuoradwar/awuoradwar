const { checkWrongPhotoRepeat } = require("../check-wrong-photo-repeat");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

// Minimal stub Firestore: one collection ("wrongPhotoTracking"), doc-by-id get/set.
function makeStubDb() {
  const store = {};
  return {
    collection: () => ({
      doc: (id) => ({
        get: async () => ({ exists: !!store[id], data: () => store[id] }),
        set: async (data) => { store[id] = data; },
      }),
    }),
    _store: store,
  };
}

const openingSubmittedAt = { toDate: () => new Date("2026-09-10T13:15:00Z") };

(async () => {
  const db = makeStubDb();

  // First time item 15 at store 1651 gets a wrong photo -- nothing to
  // compare against yet, but it registers this occurrence for next time.
  const first = await checkWrongPhotoRepeat(db, "1651", "15", "2026-09-10", "opening", openingSubmittedAt, "sub1");
  check(first === null, "The first wrong photo for a store+item reports no prior occurrence");

  // Same store+item, wrong again in a LATER submission (a different photo
  // file -- this check doesn't care, unlike checkDuplicate) -> reports
  // the earlier occurrence's day/shift.
  const second = await checkWrongPhotoRepeat(db, "1651", "15", "2026-09-11", "midday", { toDate: () => new Date("2026-09-11T18:00:00Z") }, "sub2");
  check(second !== null, `A repeated wrong photo for the same store+item reports the prior occurrence (got ${JSON.stringify(second)})`);
  check(second.priorWrongPhotoDate === "2026-09-10", `Reports the date of the EARLIER wrong photo, not the new one (got ${second.priorWrongPhotoDate})`);
  check(second.priorWrongPhotoShift === "opening", `Reports which shift the earlier wrong photo came from (got ${second.priorWrongPhotoShift})`);
  check(second.priorWrongPhotoSubmittedAt === openingSubmittedAt, `Reports the exact moment of the earlier wrong photo (got ${JSON.stringify(second.priorWrongPhotoSubmittedAt)})`);
  check(second.priorWrongPhotoSubmissionId === "sub1", `Reports which submission the earlier wrong photo came from (got ${second.priorWrongPhotoSubmissionId})`);

  // A third wrong photo compares against the SECOND occurrence now (the
  // tracking doc always advances to the most recent one), not the first.
  const third = await checkWrongPhotoRepeat(db, "1651", "15", "2026-09-12", "closing", null, "sub3");
  check(third.priorWrongPhotoDate === "2026-09-11", `Compares against the MOST RECENT prior wrong photo, not the original one (got ${third.priorWrongPhotoDate})`);
  check(third.priorWrongPhotoShift === "midday", `Shift also advances to the most recent occurrence (got ${third.priorWrongPhotoShift})`);

  // Re-processing the SAME submission again (e.g. a retried trigger) must
  // not flag itself as a repeat of itself.
  const fourth = await checkWrongPhotoRepeat(db, "1651", "15", "2026-09-12", "closing", null, "sub3");
  check(fourth === null, "Re-checking the same submission's own flag never reports it as a repeat of itself");

  // A different ITEM at the same store is a totally separate track.
  const fifth = await checkWrongPhotoRepeat(db, "1651", "16", "2026-09-12", "closing", null, "sub4");
  check(fifth === null, "A different item at the same store is tracked independently (no prior occurrence)");

  // The same item at a DIFFERENT store is also a separate track.
  const sixth = await checkWrongPhotoRepeat(db, "2441", "15", "2026-09-12", "closing", null, "sub5");
  check(sixth === null, "The same item at a different store is tracked independently (no prior occurrence)");

  // A legacy pre-shift submission (shift/submittedAt undefined) never
  // crashes and reports null instead of undefined for the missing fields.
  const seventh = await checkWrongPhotoRepeat(db, "1985", "3", "2026-08-01", undefined, undefined, "sub6");
  check(seventh === null, "A legacy submission with no shift/submittedAt registers fine");
  const eighth = await checkWrongPhotoRepeat(db, "1985", "3", "2026-08-15", "closing", { toDate: () => new Date() }, "sub7");
  check(eighth.priorWrongPhotoShift === null, `A repeat of a legacy (pre-shift) original reports priorWrongPhotoShift as null, not undefined/crashing (got ${JSON.stringify(eighth.priorWrongPhotoShift)})`);
  check(eighth.priorWrongPhotoSubmittedAt === null, `Same for priorWrongPhotoSubmittedAt when the original never recorded one (got ${JSON.stringify(eighth.priorWrongPhotoSubmittedAt)})`);

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
