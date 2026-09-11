const { checkDuplicate } = require("../check-duplicate");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

// Minimal stub Firestore: one collection ("photoHashes"), doc-by-id get/set.
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

const openingSubmittedAt = { toDate: () => new Date("2026-09-01T13:15:00Z") };

(async () => {
  const db = makeStubDb();

  // First time this exact hash is seen for store 1644 / item 16 -> not a
  // duplicate, and it registers the hash for future comparisons.
  const first = await checkDuplicate(db, "1644", "16", "hash-abc", "2026-09-01", "opening", openingSubmittedAt, "sub1");
  check(first === null, "The first time a photo's hash is seen, it's not flagged as a duplicate");

  // Same store, same item, SAME hash, a DIFFERENT submission -> duplicate.
  const second = await checkDuplicate(db, "1644", "16", "hash-abc", "2026-09-08", "midday", { toDate: () => new Date("2026-09-08T18:00:00Z") }, "sub2");
  check(second !== null && second.reason === "duplicate", `The same hash reused in a later submission IS flagged as a duplicate (got ${JSON.stringify(second)})`);
  check(second.duplicateOfDate === "2026-09-01", `Reports the date of the ORIGINAL photo, not the duplicate (got ${second.duplicateOfDate})`);
  check(second.duplicateOfShift === "opening", `Reports which SHIFT the original came from -- needed to make sense of a duplicate flagged on the very same date as the original (got ${second.duplicateOfShift})`);
  check(second.duplicateOfSubmittedAt === openingSubmittedAt, `Reports the exact moment the original was submitted -- "same day" alone isn't precise enough (got ${JSON.stringify(second.duplicateOfSubmittedAt)})`);
  check(second.duplicateOfSubmissionId === "sub1", `Reports which submission the original came from (got ${second.duplicateOfSubmissionId})`);

  // Re-processing the SAME submission again (e.g. a retried trigger) must
  // not flag itself as a duplicate of itself.
  const third = await checkDuplicate(db, "1644", "16", "hash-abc", "2026-09-01", "opening", openingSubmittedAt, "sub1");
  check(third === null, "Re-checking the same submission's own photo never flags it as a duplicate of itself");

  // Same hash, but a DIFFERENT item at the same store -> not a duplicate
  // (scoped to store+item, not store-wide).
  const fourth = await checkDuplicate(db, "1644", "3", "hash-abc", "2026-09-08", "midday", null, "sub3");
  check(fourth === null, "The same photo bytes under a DIFFERENT item are not flagged (duplicate check is scoped to store+item)");

  // Same hash, same item, but a DIFFERENT store -> not a duplicate
  // (scoped per-store, not across the whole chain).
  const fifth = await checkDuplicate(db, "1651", "16", "hash-abc", "2026-09-08", "midday", null, "sub4");
  check(fifth === null, "The same photo bytes at a DIFFERENT store are not flagged (duplicate check is scoped per-store)");

  // A legacy pre-shift submission (shift/submittedAt undefined) never
  // crashes and just reports nothing extra for the original.
  const sixth = await checkDuplicate(db, "1644", "16", "hash-legacy", "2026-08-01", undefined, undefined, "sub5");
  check(sixth === null, "A legacy submission with no shift/submittedAt registers fine");
  const seventh = await checkDuplicate(db, "1644", "16", "hash-legacy", "2026-08-15", "closing", { toDate: () => new Date() }, "sub6");
  check(seventh.duplicateOfShift === null, `A duplicate of a legacy (pre-shift) original reports duplicateOfShift as null, not undefined/crashing (got ${JSON.stringify(seventh.duplicateOfShift)})`);
  check(seventh.duplicateOfSubmittedAt === null, `Same for duplicateOfSubmittedAt when the original never recorded one (got ${JSON.stringify(seventh.duplicateOfSubmittedAt)})`);

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
