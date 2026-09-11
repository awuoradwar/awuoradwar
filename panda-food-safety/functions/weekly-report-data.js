// Pure data-shaping for the weekly slide deck -- no Firestore, no
// pptxgenjs, so it's testable with plain objects. Mirrors the same
// aggregations js/admin.js's Weekly Report tab computes client-side:
// store completion, cross-store trending violations (an item flagged
// at 2+ DIFFERENT stores this week, even if no single store hit it
// twice on its own), repeat violations by store, every flagged item,
// and automated photo flags grouped by reason.
const SHIFTS = ["opening", "midday", "closing"];
const REPEAT_VIOLATION_THRESHOLD = 2;
const RISK_SORT_RANK = { high: 0, medium: 1, low: 2 };

function shiftDocId(storeNumber, date, shiftKey) {
  return `${storeNumber}_${date}_${shiftKey}`;
}
function legacyDocId(storeNumber, date) {
  return `${storeNumber}_${date}`;
}

// docsForDay: every submission doc sharing one store+date. A legacy
// (pre-shift) submitted doc counts as covering all 3 shifts, same as
// the client-side shifts.js version.
function shiftsCoveredForDay(docsForDay) {
  const legacyDoc = docsForDay.find((d) => d.id === legacyDocId(d.storeNumber, d.date) && d.submitted);
  if (legacyDoc) return { doneCount: 3 };
  const doneCount = SHIFTS.filter((shift) => docsForDay.some((d) => d.id === shiftDocId(d.storeNumber, d.date, shift) && d.submitted)).length;
  return { doneCount };
}

// Sun-Sat, 7 date strings starting from `from` (a "YYYY-MM-DD" string).
function weekDatesList(from) {
  const [y, m, d] = from.split("-").map(Number);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m - 1, d + i);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }
  return out;
}

// storeNumber -> itemId -> { item, count, dates: [] }
function buildItemNoCounts(submissions, findItemDefinitionById) {
  const byStore = {};
  submissions.forEach((data) => {
    if (!data.submitted) return;
    const bucket = (byStore[data.storeNumber] ||= {});
    for (const id of Object.keys(data.answers || {})) {
      const a = data.answers[id];
      if (a?.value !== "no") continue;
      const item = findItemDefinitionById(id) || { id, en: `#${id}`, risk: "medium" };
      const entry = (bucket[id] ||= { item, count: 0, dates: [] });
      entry.count += 1;
      entry.dates.push(data.date);
    }
  });
  return byStore;
}

// { from, storeNumbers, submissions, aiFlags, findItemDefinitionById } ->
// everything the slide deck needs, already grouped/sorted/filtered.
function computeWeeklyReportData({ from, storeNumbers, submissions, aiFlags, findItemDefinitionById }) {
  const weekDates = weekDatesList(from);
  const submittedDocs = submissions.filter((s) => s.submitted);

  const byStoreDates = {};
  submittedDocs.forEach((s) => {
    const bucket = (byStoreDates[s.storeNumber] ||= {});
    (bucket[s.date] ||= []).push(s);
  });
  const storeCompletion = storeNumbers
    .map((storeNumber) => {
      const docsByDate = byStoreDates[storeNumber] || {};
      const doneDays = weekDates.filter((date) => shiftsCoveredForDay(docsByDate[date] || []).doneCount === 3).length;
      return { storeNumber, doneDays };
    })
    .sort((a, b) => a.doneDays - b.doneDays || Number(a.storeNumber) - Number(b.storeNumber));
  const fullyCompliantCount = storeCompletion.filter((r) => r.doneDays === 7).length;

  const byStoreItemCounts = buildItemNoCounts(submittedDocs, findItemDefinitionById);
  const repeatByStore = storeNumbers
    .map((storeNumber) => {
      const items = Object.values(byStoreItemCounts[storeNumber] || {}).filter((e) => e.count >= REPEAT_VIOLATION_THRESHOLD);
      items.sort((a, b) => (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) || b.count - a.count);
      return { storeNumber, items };
    })
    .filter((r) => r.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length || Number(a.storeNumber) - Number(b.storeNumber));

  // itemId -> { item, totalCount, storeEntries: [{storeNumber, count}] }
  const crossStoreMap = {};
  for (const storeNumber of Object.keys(byStoreItemCounts)) {
    for (const [itemId, entry] of Object.entries(byStoreItemCounts[storeNumber])) {
      const bucket = (crossStoreMap[itemId] ||= { item: entry.item, totalCount: 0, storeEntries: [] });
      bucket.totalCount += entry.count;
      bucket.storeEntries.push({ storeNumber, count: entry.count });
    }
  }
  const trending = Object.values(crossStoreMap)
    .filter((e) => e.storeEntries.length >= 2)
    .sort(
      (a, b) =>
        (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) ||
        b.storeEntries.length - a.storeEntries.length ||
        b.totalCount - a.totalCount
    );

  const allFlaggedByStore = {};
  submittedDocs.forEach((s) => {
    for (const id of Object.keys(s.answers || {})) {
      const a = s.answers[id];
      if (a?.value !== "no") continue;
      const item = findItemDefinitionById(id) || { id, en: `#${id}`, risk: "medium" };
      (allFlaggedByStore[s.storeNumber] ||= []).push({ item, date: s.date, shift: s.shift, conductedBy: s.conductedBy, note: a.note });
    }
  });
  const allFlagged = storeNumbers
    .map((storeNumber) => {
      const rows = (allFlaggedByStore[storeNumber] || []).sort(
        (a, b) => (RISK_SORT_RANK[a.item.risk] ?? 1) - (RISK_SORT_RANK[b.item.risk] ?? 1) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      );
      return { storeNumber, rows };
    })
    .filter((r) => r.rows.length > 0)
    .sort((a, b) => b.rows.length - a.rows.length || Number(a.storeNumber) - Number(b.storeNumber));
  const totalFlagged = allFlagged.reduce((sum, r) => sum + r.rows.length, 0);

  const aiFlagsByReason = {};
  aiFlags.forEach((flag) => {
    const reason = flag.reason || "mismatch";
    const item = findItemDefinitionById(flag.itemId) || { id: flag.itemId, en: `#${flag.itemId}`, risk: "medium" };
    (aiFlagsByReason[reason] ||= []).push({ ...flag, item });
  });

  return {
    weekDates,
    storeCompletion,
    fullyCompliantCount,
    totalStores: storeNumbers.length,
    repeatByStore,
    totalRepeat: repeatByStore.reduce((sum, r) => sum + r.items.length, 0),
    trending,
    allFlagged,
    totalFlagged,
    aiFlagsByReason,
    totalAiFlags: aiFlags.length,
  };
}

module.exports = { computeWeeklyReportData, weekDatesList, shiftsCoveredForDay, buildItemNoCounts, REPEAT_VIOLATION_THRESHOLD };
