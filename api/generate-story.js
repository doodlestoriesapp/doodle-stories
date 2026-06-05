// v5 - raw fetch, no SDK import
export default async function handler(req, res) {
  console.log("generate-story v5 called");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, system, model, max_tokens, language } = req.body;

    let finalSystem = system || "";
    if (language && language !== "English") {
      finalSystem += `\n\nWrite the entire story in ${language}. The title and all story text must be in ${language}.`;
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: max_tokens || 1000,
        system: finalSystem,
        messages,
      }),
    });

    const data = await anthropicRes.json();
    console.log("Anthropic status:", anthropicRes.status);

    if (!anthropicRes.ok) {
      return res.status(500).json({ error: data?.error?.message || "Anthropic API error" });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("generate-story v5 error:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Story generation failed" });
  }
}
