const assert = require("assert");
const { evaluateTempReading } = require("../temp-check-logic");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

// Item 15: Teriyaki, needs >165°F. Associate said "yes" but photo reads 142 -> mismatch.
{
  const r = evaluateTempReading("15", "yes", { readable: true, temperatureF: 142, confidence: "high" });
  check(r.mismatch === true, "Item 15: yes + 142°F (below 165 threshold) is a mismatch");
}

// Item 15: associate said "yes", photo reads 170 -> agrees, no mismatch.
{
  const r = evaluateTempReading("15", "yes", { readable: true, temperatureF: 170, confidence: "high" });
  check(r.mismatch === false, "Item 15: yes + 170°F (above threshold) is NOT a mismatch");
}

// Item 15: associate said "no" (correctly reporting failure), photo reads 140 -> agrees, no mismatch.
{
  const r = evaluateTempReading("15", "no", { readable: true, temperatureF: 140, confidence: "medium" });
  check(r.mismatch === false, "Item 15: no + 140°F (correctly reported failure) is NOT a mismatch");
}

// Item 3: reach-in cooler, needs <41°F. Associate said "yes", photo reads 45 -> mismatch.
{
  const r = evaluateTempReading("3", "yes", { readable: true, temperatureF: 45, confidence: "high" });
  check(r.mismatch === true, "Item 3: yes + 45°F (above 41 threshold) is a mismatch");
}

// Item 16: walk-in cooler, needs <41°F. Associate said "yes", photo reads 38 -> agrees.
{
  const r = evaluateTempReading("16", "yes", { readable: true, temperatureF: 38, confidence: "high" });
  check(r.mismatch === false, "Item 16: yes + 38°F (below threshold) is NOT a mismatch");
}

// Unreadable photo -> never labeled a mismatch, but flagged as its own
// "unreadable" reason -- a blank/wrong-subject photo IS itself worth
// surfacing, not silently dropped.
{
  const r = evaluateTempReading("15", "yes", { readable: false, temperatureF: null, confidence: "low" });
  check(r.mismatch === false && r.readable === false && r.reason === "unreadable", `An unreadable photo is flagged as "unreadable", never as a mismatch (got ${JSON.stringify(r)})`);
}

// A thermometer genuinely IS in frame, just too blurry/obstructed to
// read -- stays "unreadable" (a photography problem, worth a retake).
{
  const r = evaluateTempReading("15", "yes", { readable: false, temperatureF: null, confidence: "low", thermometerVisible: true });
  check(r.reason === "unreadable", `A blurry-but-present thermometer is "unreadable", not "wrongPhoto" (got ${JSON.stringify(r.reason)})`);
}

// No thermometer/display in the photo at all -> a different, more
// serious problem than blurriness: the wrong picture was uploaded.
{
  const r = evaluateTempReading("16", "yes", { readable: false, temperatureF: null, confidence: "low", thermometerVisible: false });
  check(r.reason === "wrongPhoto", `A photo with no thermometer in frame at all is tagged "wrongPhoto", distinct from a merely unclear one (got ${JSON.stringify(r.reason)})`);
}

// A readable, agreeing photo has reason: null -- stored for the audit
// trail but not surfaced as a notable flag.
{
  const r = evaluateTempReading("16", "yes", { readable: true, temperatureF: 38, confidence: "high" });
  check(r.reason === null, `A readable, agreeing reading has no flag reason (got ${JSON.stringify(r.reason)})`);
}

// A real mismatch is tagged reason: "mismatch".
{
  const r = evaluateTempReading("15", "yes", { readable: true, temperatureF: 142, confidence: "high" });
  check(r.reason === "mismatch", `A real mismatch is tagged reason:"mismatch" (got ${JSON.stringify(r.reason)})`);
}

// Item not in scope -> returns null (nothing to check).
{
  const r = evaluateTempReading("9", "yes", { readable: true, temperatureF: 130, confidence: "high" });
  check(r === null, "An item outside the configured scope (e.g. #9) returns null");
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
