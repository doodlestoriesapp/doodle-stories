import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Friendly compliance error shown to the user in the app ────────
const COMPLIANCE_ERROR = {
  error: "compliance_failed",
  message:
    "Uh oh! 🎨 This drawing didn't pass our safety check for kids' stories. Please try a different drawing!",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, system, model, max_tokens } = req.body;

    // ── Pull the image out of the incoming request ────────────────
    // The image is always the first content block of the first message
    const imageBlock = messages?.[0]?.content?.find(
      (b) => b.type === "image"
    );

    if (!imageBlock) {
      return res.status(400).json({ error: "No image provided" });
    }

    // ── STEP 1: Moderation pre-flight (Haiku — fast & cheap) ─────
    const moderationResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: [
            imageBlock, // reuse the exact same image block
            {
              type: "text",
              text: `You are a strict content moderator for a children's app used by kids aged 2–13.
Examine this image carefully.

Reply with only one word — SAFE or UNSAFE.

Mark UNSAFE if the image contains ANY of the following:
- Nudity or sexual content
- Violence, gore, or weapons used to harm
- Hate symbols, slurs, or discriminatory imagery
- Drug or alcohol references
- Real photographs of people in compromising situations
- Explicit or distressing scenes of any kind

Mark SAFE if it is a child's drawing, doodle, cartoon, or any age-appropriate image.
When in doubt, mark SAFE — this is a kids' creative app.

Reply only: SAFE or UNSAFE`,
            },
          ],
        },
      ],
    });

    const verdict = moderationResponse.content?.[0]?.text?.trim().toUpperCase();
    console.log("🔍 Moderation verdict:", verdict);

    // ── If UNSAFE, stop here — do not generate a story ───────────
    if (verdict !== "SAFE") {
      console.warn("🚫 Image failed moderation — story generation blocked.");
      return res.status(400).json(COMPLIANCE_ERROR);
    }

    // ── STEP 2: Story generation (only reached if SAFE) ──────────
    const storyResponse = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: max_tokens || 1000,
      system,
      messages,
    });

    return res.status(200).json(storyResponse);
  } catch (err) {
    console.error("❌ generate-story error:", err);
    return res.status(500).json({ error: "Story generation failed. Please try again." });
  }
}
