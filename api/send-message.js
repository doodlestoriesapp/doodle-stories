// api/send-message.js
//
// Delivers "Report this story" reports and Contact-form messages from the
// mobile app to the DoodleStories inbox.
//
// Email is sent with Resend (resend.com). The API key lives only in Vercel:
// Project → Settings → Environment Variables → RESEND_API_KEY.
// Until a domain is verified in Resend, mail is sent from onboarding@resend.dev,
// which can only deliver to the email address that owns the Resend account —
// so the Resend account must be created with doodlestoriesapp@gmail.com.

const INBOX = "doodlestoriesapp@gmail.com";
const FROM = "DoodleStories <onboarding@resend.dev>";

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("send-message: RESEND_API_KEY is not set");
    return res.status(500).json({ error: "Messaging is not configured" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }
  }

  let subject;
  let text;

  if (body.type === "report") {
    const story = clip(body.story, 3000);
    if (!story) return res.status(400).json({ error: "Missing story text" });
    const title = clip(body.title, 200);
    const source = clip(body.source, 40) || "Android app";
    subject = "DoodleStories: story reported";
    text = `A story was reported from the ${source}.\n\nTitle: ${title || "(none)"}\n\n${story}`;
  } else if (body.type === "contact") {
    const name = clip(body.name, 100);
    const email = clip(body.email, 200);
    const reason = clip(body.reason, 200);
    const message = clip(body.message, 5000);
    if (!name || !email || !reason || !message) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }
    subject = `DoodleStories Contact: ${reason}`;
    text = `New message from the Android app's Contact form.\n\nName: ${name}\nEmail: ${email}\nReason: ${reason}\n\n${message}`;
  } else {
    return res.status(400).json({ error: "Unknown message type" });
  }

  try {
    const upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "doodlestories-server/1.0",
      },
      body: JSON.stringify({ from: FROM, to: [INBOX], subject, text }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data.id) {
      console.error("Resend did not accept the message:", upstream.status, data.message || data.name);
      return res.status(502).json({ error: "Message could not be delivered", detail: `${upstream.status} ${data.message || ""}`.trim() });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("send-message failed:", err?.message);
    return res.status(502).json({ error: "Message could not be delivered" });
  }
}