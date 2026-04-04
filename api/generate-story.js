import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, system, model, max_tokens } = req.body;

    // ── Pull image data from the request ─────────────────────────
    const imageBlock = messages?.[0]?.content?.find((b) => b.type === "image");

    if (!imageBlock) {
      return res.status(400).json({ error: "No image provided" });
    }

    // ── STEP 1: Moderation — claude-sonnet handles vision correctly
    // We use sonnet here because haiku-4-5 does not support vision.
    // Wrap in its own try/catch so a moderation error never kills story gen.
    let blocked = false;
    try {
      const moderationResponse = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: [
              imageBlock,
              {
                type: "text",
                text: `You moderate a children's storytelling app for kids aged 2-13. Look at this image and reply with one word only.

Reply UNSAFE if the image contains: nudity, sexual content, graphic violence, gore, hate symbols, or adult content of any kind.
Reply SAFE for children's drawings, doodles, cartoons, or anything age-appropriate. When in doubt reply SAFE.

One word only: SAFE or UNSAFE`,
              },
            ],
          },
        ],
      });

      const verdict = moderationResponse.content?.[0]?.text?.trim().toUpperCase() ?? "";
      console.log("🔍 Moderation verdict:", verdict);
      blocked = verdict.startsWith("UNSAFE");
    } catch (modErr) {
      // Moderation call failed — fail open, don't block story generation
      console.error("⚠️ Moderation check failed, proceeding:", modErr?.message);
      blocked = false;
    }

    if (blocked) {
      console.warn("🚫 Image blocked by moderation");
      return res.status(400).json({ error: "compliance_failed" });
    }

    // ── STEP 2: Generate the story ────────────────────────────────
    const storyResponse = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: max_tokens || 1000,
      system,
      messages,
    });

    return res.status(200).json(storyResponse);

  } catch (err) {
    console.error("❌ generate-story error:", err?.message ?? err);
    return res.status(500).json({ error: "Story generation failed. Please try again." });
  }
}
