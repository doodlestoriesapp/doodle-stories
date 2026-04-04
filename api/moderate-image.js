import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Vercel already parses JSON bodies for serverless functions,
// but we guard against edge cases explicitly.
export default async function handler(req, res) {
  // Allow CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ safe: true, error: "Method not allowed" });
  }

  try {
    // Body may arrive as string if Content-Type isn't set correctly
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { imageBase64, mediaType } = body || {};

    if (!imageBase64) {
      console.error("❌ moderate-image: no imageBase64 in body");
      // Fail open — missing image shouldn't block the user
      return res.status(200).json({ safe: true });
    }

    // Sanitise mediaType — Anthropic only accepts these four values
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : "image/png";

    console.log("🔍 Running moderation check, mediaType:", safeMediaType);

    const moderationResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: safeMediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `You are a strict content moderator for a children's storytelling app used by kids aged 2–13.

Examine this image carefully and reply with only one word.

Reply UNSAFE if the image contains ANY of the following:
- Nudity or sexual content of any kind
- Graphic violence, gore, or weapons used to harm people
- Hate symbols, racist imagery, or discriminatory content
- Drug or alcohol references
- Explicit or deeply distressing scenes

Reply SAFE for all of the following:
- Children's drawings or doodles (even rough or abstract ones)
- Cartoons, stick figures, animals, objects, nature scenes
- Any image that is clearly age-appropriate

When in doubt, reply SAFE. Do not over-flag innocent children's art.

Reply only the single word SAFE or UNSAFE — nothing else.`,
            },
          ],
        },
      ],
    });

    const raw = moderationResponse.content?.[0]?.text?.trim().toUpperCase() ?? "";
    // Accept anything that starts with UNSAFE as a block signal
    const safe = !raw.startsWith("UNSAFE");

    console.log(`🔍 Moderation raw response: "${raw}" → safe=${safe}`);
    return res.status(200).json({ safe });

  } catch (err) {
    console.error("❌ moderate-image exception:", err?.message ?? err);
    // Fail open — a crashed moderation check shouldn't break the app for kids
    return res.status(200).json({ safe: true });
  }
}
