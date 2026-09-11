// Builds an actual .pptx slide deck (via pptxgenjs) from the shape
// computeWeeklyReportData() returns. Kept separate from that pure data
// module so the two can be reasoned about (and, for the data side,
// tested) independently -- this file's job is only "lay this data out
// on slides," not compute what the numbers mean.
const pptxgen = require("pptxgenjs");

const COLORS = {
  bg: "1A140F",
  text: "F5EFE7",
  muted: "B8AC9C",
  accent: "E0A030",
  high: "D9534F",
  medium: "E0A030",
  low: "8A8272",
  headerRow: "2A211A",
};
const RISK_LABEL = { high: "High Risk", medium: "Medium Risk", low: "Low Risk" };
const REASON_LABEL = { mismatch: "Temperature Mismatches", duplicate: "Reused Photos", wrongPhoto: "Wrong Photos", unreadable: "Unclear Photos" };
const ROWS_PER_SLIDE = 10;

function riskColor(risk) {
  return COLORS[risk] || COLORS.low;
}

function addTitleSlide(pres, weekLabel) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };
  slide.addText("Weekly Food Safety Report", { x: 0.6, y: 2.6, w: 12, h: 1, fontSize: 36, bold: true, color: COLORS.text });
  slide.addText(weekLabel, { x: 0.6, y: 3.5, w: 12, h: 0.6, fontSize: 20, color: COLORS.muted });
}

function addSummarySlide(pres, data) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };
  slide.addText("Summary", { x: 0.6, y: 0.4, fontSize: 28, bold: true, color: COLORS.text });
  const stats = [
    [`${data.fullyCompliantCount} / ${data.totalStores}`, "Stores Fully Compliant"],
    [String(data.totalFlagged), "Flagged Items"],
    [String(data.totalRepeat), "Repeat Violations"],
    [String(data.totalAiFlags), "Automated Photo Flags"],
  ];
  stats.forEach(([big, label], i) => {
    const x = 0.6 + (i % 2) * 6.2;
    const y = 1.6 + Math.floor(i / 2) * 2.2;
    slide.addText(big, { x, y, w: 5.6, h: 1, fontSize: 40, bold: true, color: COLORS.accent, align: "center" });
    slide.addText(label, { x, y: y + 1, w: 5.6, h: 0.5, fontSize: 16, color: COLORS.muted, align: "center" });
  });
}

function tableSlideOptions() {
  return {
    x: 0.5,
    y: 1.2,
    w: 12.3,
    fontSize: 13,
    color: COLORS.text,
    border: { type: "solid", color: COLORS.headerRow, pt: 0.5 },
    autoPage: false,
  };
}

// Splits `rows` into ROWS_PER_SLIDE-sized chunks, adding one slide per
// chunk with `title` (and "(cont'd)" after the first) plus a header row.
function addTableSlides(pres, title, header, rows, colWidths) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += ROWS_PER_SLIDE) {
    const chunk = rows.slice(i, i + ROWS_PER_SLIDE);
    const slide = pres.addSlide();
    slide.background = { color: COLORS.bg };
    slide.addText(i === 0 ? title : `${title} (cont'd)`, { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: COLORS.text });
    const headerCells = header.map((h) => ({ text: h, options: { bold: true, fill: { color: COLORS.headerRow }, color: COLORS.text } }));
    slide.addTable([headerCells, ...chunk], { ...tableSlideOptions(), colW: colWidths });
  }
}

function riskCell(risk) {
  return { text: RISK_LABEL[risk] || "Medium Risk", options: { color: riskColor(risk), bold: true } };
}
function itemCell(item) {
  return `${item.id}. ${item.en}`;
}

function buildStoreCompletionSlides(pres, data) {
  const rows = data.storeCompletion.map((r) => [String(r.storeNumber), `${r.doneDays} / 7`]);
  addTableSlides(pres, "Store Completion", ["Store", "Days Fully Complete"], rows, [8, 4.3]);
}

function buildTrendingSlides(pres, data) {
  const rows = data.trending.map((e) => [
    itemCell(e.item),
    riskCell(e.item.risk),
    e.storeEntries.map((se) => se.storeNumber).join(", "),
    `${e.totalCount}×`,
  ]);
  addTableSlides(pres, "Trending Violations — Multiple Stores", ["Item", "Risk", "Stores", "Count"], rows, [6.5, 2, 2.8, 1]);
}

function buildRepeatByStoreSlides(pres, data) {
  const rows = data.repeatByStore.flatMap((r) => r.items.map((entry) => [r.storeNumber, itemCell(entry.item), riskCell(entry.item.risk), `${entry.count}×`]));
  addTableSlides(pres, "Repeat Violations by Store", ["Store", "Item", "Risk", "Count"], rows, [1.5, 7, 2.3, 1.5]);
}

function buildAllFlaggedSlides(pres, data) {
  const rows = data.allFlagged.flatMap((r) =>
    r.rows.map((row) => [r.storeNumber, itemCell(row.item), riskCell(row.item.risk), `${row.date}${row.shift ? " · " + row.shift : ""} · ${row.conductedBy}${row.note ? " — " + row.note : ""}`])
  );
  addTableSlides(pres, "All Flagged Items", ["Store", "Item", "Risk", "Details"], rows, [1.3, 4.5, 1.7, 4.8]);
}

function buildAiFlagSlides(pres, data) {
  for (const reason of ["mismatch", "duplicate", "wrongPhoto", "unreadable"]) {
    const flags = data.aiFlagsByReason[reason];
    if (!flags || flags.length === 0) continue;
    const rows = flags.map((flag) => [flag.storeNumber, itemCell(flag.item), `${flag.date}${flag.shift ? " · " + flag.shift : ""} · ${flag.conductedBy}`]);
    addTableSlides(pres, REASON_LABEL[reason], ["Store", "Item", "Details"], rows, [1.5, 7, 4.3]);
  }
}

// data: the object computeWeeklyReportData() returns. weekLabel: a
// human-readable range, e.g. "Sep 6 - Sep 12, 2026". Returns a base64
// string (a real .pptx file once base64-decoded).
async function buildWeeklyReportPptx(data, weekLabel) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Panda Food Safety Checklist";
  pres.title = `Weekly Food Safety Report — ${weekLabel}`;

  addTitleSlide(pres, weekLabel);
  addSummarySlide(pres, data);
  buildStoreCompletionSlides(pres, data);
  buildTrendingSlides(pres, data);
  buildRepeatByStoreSlides(pres, data);
  buildAllFlaggedSlides(pres, data);
  buildAiFlagSlides(pres, data);

  return pres.write({ outputType: "base64" });
}

module.exports = { buildWeeklyReportPptx };
