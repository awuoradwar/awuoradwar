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

  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
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
