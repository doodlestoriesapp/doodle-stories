// v5 - raw fetch, no SDK import

function getRequestOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function getLimitHeaders(req) {
  const headers = {};
  if (req.headers["x-forwarded-for"]) {
    headers["x-forwarded-for"] = req.headers["x-forwarded-for"];
  }
  return headers;
}

export default async function handler(req, res) {
  console.log("generate-story v5 called");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const origin = getRequestOrigin(req);
    const limitHeaders = getLimitHeaders(req);

    const limitRes = await fetch(`${origin}/api/check-story-limit`, {
      method: "GET",
      headers: limitHeaders,
    });
    const limitData = await limitRes.json().catch(() => ({}));

    if (!limitData.canGenerate && !limitData.isPremium) {
      return res.status(403).json({
        error: "STORY_LIMIT_REACHED",
        message: "You have reached your 10 story limit for this month.",
        upgradeUrl: "/upgrade",
      });
    }

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

    fetch(`${origin}/api/check-story-limit`, {
      method: "POST",
      headers: limitHeaders,
    }).catch((err) =>
      console.warn("Failed to increment story limit:", err?.message ?? err)
    );

    return res.status(200).json(data);

  } catch (err) {
    console.error("generate-story v5 error:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Story generation failed" });
  }
}
