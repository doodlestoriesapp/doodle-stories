import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mediaType = "image/png" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const moderationResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: `You are a strict content moderator for a children's app used by kids aged 2–13.
Examine this image carefully.

Reply with only one word — SAFE or UNSAFE.

Mark UNSAFE if the image contains ANY of the following:
- Nudity or sexual content of any kind
- Violence, gore, or weapons used to harm
- Hate symbols, slurs, or discriminatory imagery
- Drug or alcohol references
- Real photographs of people in compromising situations
- Explicit or distressing scenes of any kind

Mark SAFE if it is a child's drawing, doodle, cartoon, or any age-appropriate image.
When in doubt about ambiguous abstract drawings, mark SAFE.

Reply only: SAFE or UNSAFE`,
            },
          ],
        },
      ],
    });

    const verdict = moderationResponse.content?.[0]?.text?.trim().toUpperCase();
    console.log("🔍 Moderation verdict:", verdict);

    const safe = verdict === "SAFE";
    return res.status(200).json({ safe });
  } catch (err) {
    console.error("❌ moderate-image error:", err);
    // Fail open — if moderation errors, don't block the child
    return res.status(200).json({ safe: true });
  }
}
