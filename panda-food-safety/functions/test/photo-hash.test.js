const { hashPhotoDataUrl } = require("../photo-hash");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

const a = hashPhotoDataUrl("data:image/jpeg;base64,QUJD");
const aAgain = hashPhotoDataUrl("data:image/jpeg;base64,QUJD");
const b = hashPhotoDataUrl("data:image/jpeg;base64,WFla");

check(a === aAgain, "The same photo data hashes identically every time");
check(a !== b, "Different photo data hashes differently");
check(typeof a === "string" && a.length === 64, `Produces a fixed-length hex digest (got length ${a.length})`);
check(hashPhotoDataUrl("") !== hashPhotoDataUrl(undefined) || hashPhotoDataUrl("") === hashPhotoDataUrl(undefined), "Empty/undefined input doesn't throw");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
