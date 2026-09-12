// Pure logic for the automatic temperature-photo check — kept separate
// from index.js so it can be unit-tested without Firebase/Anthropic
// running. Only the 3 photo-required temperature items chosen for this
// feature are covered; every other item is untouched.
const TEMP_CHECK_ITEMS = {
  3: { op: "<", threshold: 41 }, // reach-in cooler
  15: { op: ">", threshold: 165 }, // Grilled Teriyaki Chicken
  16: { op: "<", threshold: 41 }, // walk-in cooler
};

function thresholdPasses(temperatureF, itemId) {
  const check = TEMP_CHECK_ITEMS[itemId];
  return check.op === "<" ? temperatureF < check.threshold : temperatureF > check.threshold;
}

// Compares what the photo actually shows against what the associate
// answered. Returns null only when the item is out of scope entirely.
// A photo with no usable reading is its own flagged reason rather than
// silently dropped — worth a human glance, not proof of a failed
// reading, so it's never labeled a "mismatch" (that would falsely
// assert the photo contradicts the answer when there's no reading to
// compare at all). Split into two distinct reasons: "unreadable" (a
// thermometer IS in frame but its number can't be made out -- a
// photography problem, worth a retake) vs "wrongPhoto" (no thermometer
// in the photo at all -- the wrong picture was uploaded entirely, a
// bigger compliance issue than a blurry shot).
function evaluateTempReading(itemId, associateAnswer, reading) {
  const check = TEMP_CHECK_ITEMS[itemId];
  if (!check) return null;
  if (!reading || !reading.readable || typeof reading.temperatureF !== "number") {
    const reason = reading && reading.thermometerVisible === false ? "wrongPhoto" : "unreadable";
    return { itemId, readable: false, reason, mismatch: false, associateAnswer };
  }
  const computedPass = thresholdPasses(reading.temperatureF, itemId);
  const associatePass = associateAnswer === "yes";
  const mismatch = computedPass !== associatePass;
  return {
    itemId,
    readable: true,
    temperatureF: reading.temperatureF,
    confidence: reading.confidence,
    expectedOp: check.op,
    expectedThreshold: check.threshold,
    associateAnswer,
    mismatch,
    reason: mismatch ? "mismatch" : null,
  };
}

module.exports = { TEMP_CHECK_ITEMS, thresholdPasses, evaluateTempReading };
