const crypto = require("crypto");

// Exact-duplicate detection only (not perceptual/near-duplicate hashing)
// — deliberately conservative. Two real camera photos, even of the same
// subject seconds apart, essentially never hash identical (JPEG
// re-encoding + sensor noise), so an exact hash match is strong,
// low-false-positive evidence the same file was reused, not a
// coincidence worth chasing with fuzzier matching.
function hashPhotoDataUrl(dataUrl) {
  return crypto.createHash("sha256").update(dataUrl || "").digest("hex");
}

module.exports = { hashPhotoDataUrl };
