// The three required daily checks — shared between the associate flow
// (js/app.js) and the admin dashboard (js/admin.js). A submission's doc
// ID is `${storeNumber}_${date}_${shiftKey}` going forward; an ID with
// no shift suffix (`${storeNumber}_${date}`) is a submission from
// before this existed, when a store only ever did one check a day.
// Those legacy submissions are treated as covering all three shifts for
// that day, so a day that was already fully compliant under the old
// one-check system doesn't retroactively look incomplete now that three
// are required.
const SHIFTS = ["opening", "midday", "closing"];

function shiftDocId(storeNumber, date, shiftKey) {
  return `${storeNumber}_${date}_${shiftKey}`;
}

function legacyDocId(storeNumber, date) {
  return `${storeNumber}_${date}`;
}

// docsForDay: every submission doc sharing one store+date (0-3 shift
// docs, or one legacy doc). Returns which of the 3 shifts are covered
// by a *submitted* doc, how many (0-3), and whether that coverage came
// from a legacy doc rather than real per-shift submissions.
function shiftsCoveredForDay(docsForDay) {
  const legacyDoc = docsForDay.find((d) => d.id === legacyDocId(d.storeNumber, d.date) && d.submitted);
  if (legacyDoc) {
    return { opening: legacyDoc, midday: legacyDoc, closing: legacyDoc, legacy: true, doneCount: 3 };
  }
  const covered = { opening: null, midday: null, closing: null };
  for (const shift of SHIFTS) {
    covered[shift] = docsForDay.find((d) => d.id === shiftDocId(d.storeNumber, d.date, shift) && d.submitted) || null;
  }
  const doneCount = SHIFTS.filter((s) => covered[s]).length;
  return { ...covered, legacy: false, doneCount };
}
