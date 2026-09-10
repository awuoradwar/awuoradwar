const { z } = require("zod");
const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");

const TempReadingSchema = z.object({
  readable: z.boolean(),
  temperatureF: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

const UNREADABLE = { readable: false, temperatureF: null, confidence: "low" };

// Isolated from index.js (which also wires up firebase-admin) so this can
// be unit-tested with a stub Anthropic client and no Firebase involved.
async function readTemperatureFromPhoto(client, dataUrl) {
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return UNREADABLE;
  const [, mediaType, base64Data] = match;

  // Started on Haiku 4.5 for cost, but real backfilled photos showed it
  // misreading clearly-legible digital thermometer displays (e.g. 172°F
  // read as 154°F) — not a close call on a blurry photo, a clean wrong
  // digit. Opus 5 costs a bit more per photo but the gap is trivial at
  // this app's volume, and a wrong read here means a false accusation.
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          {
            type: "text",
            text: "This photo was taken during a restaurant food-safety walkthrough to document a thermometer or temperature display reading. Read the numeric temperature (in Fahrenheit) shown in the photo. If no clear numeric reading is visible (blurry, obstructed, wrong subject, no display in frame), set readable to false and temperatureF to null.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(TempReadingSchema) },
  });

  return response.parsed_output || UNREADABLE;
}

module.exports = { readTemperatureFromPhoto, TempReadingSchema };
