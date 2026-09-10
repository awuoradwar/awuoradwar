const { readTemperatureFromPhoto } = require("../read-temperature");

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log(`FAIL: ${msg}`); }
  else console.log(`PASS: ${msg}`);
}

(async () => {
  // A well-formed data URL is parsed into media_type + base64 data and
  // passed through to the vision call correctly.
  {
    let capturedRequest = null;
    const stubClient = {
      messages: {
        parse: async (req) => {
          capturedRequest = req;
          return { parsed_output: { readable: true, temperatureF: 168, confidence: "high" } };
        },
      },
    };
    const result = await readTemperatureFromPhoto(stubClient, "data:image/jpeg;base64,QUJD");
    check(result.temperatureF === 168, `Returns the model's parsed reading (got ${JSON.stringify(result)})`);
    check(capturedRequest.model === "claude-opus-5", `Calls Opus 5, not a different model (got ${capturedRequest.model})`);
    const imageBlock = capturedRequest.messages[0].content.find((b) => b.type === "image");
    check(imageBlock.source.media_type === "image/jpeg" && imageBlock.source.data === "QUJD", `Image media_type and base64 data are extracted correctly from the data URL (got ${JSON.stringify(imageBlock.source)})`);
  }

  // A malformed / missing data URL never reaches the API — returns unreadable immediately.
  {
    let called = false;
    const stubClient = { messages: { parse: async () => { called = true; return {}; } } };
    const result = await readTemperatureFromPhoto(stubClient, "not-a-data-url");
    check(!called, "A malformed data URL never triggers an API call");
    check(result.readable === false, "A malformed data URL returns readable:false");
  }

  // parsed_output missing/null (structured-output parse failure) falls back to unreadable, doesn't throw.
  {
    const stubClient = { messages: { parse: async () => ({ parsed_output: null }) } };
    const result = await readTemperatureFromPhoto(stubClient, "data:image/png;base64,WFla");
    check(result.readable === false, "A failed structured-output parse falls back to readable:false instead of throwing");
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
