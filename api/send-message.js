// api/send-message.js
//
// Delivers "Report this story" reports and Contact-form messages from the
// mobile app to the DoodleStories inbox.
//
// Why this exists: FormSubmit (our form-to-email service) identifies a form by
// the website it is sent from. The Android app is not a website, so FormSubmit
// silently drops messages sent from it directly. Sending them through our own
// server lets us tell FormSubmit they come from doodlestories.app.

const INBOX = "doodlestoriesapp@gmail.com";
const SITE = "https://www.doodlestories.app";

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  let payload;

  if (body.type === "report") {
    const story = clip(body.story, 3000);
    if (!story) return res.status(400).json({ error: "Missing story text" });
    payload = {
      _subject: "DoodleStories: story reported",
      source: clip(body.source, 40) || "Android app",
      title: clip(body.title, 200),
      story,
    };
  } else if (body.type === "contact") {
    const name = clip(body.name, 100);
    const email = clip(body.email, 200);
    const reason = clip(body.reason, 200);
    const message = clip(body.message, 5000);
    if (!name || !email || !reason || !message) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }
    payload = { _subject: `DoodleStories Contact: ${reason}`, source: "Android app", name, email, reason, message };
  } else {
    return res.status(400).json({ error: "Unknown message type" });
  }

  try {
    const upstream = await fetch(`https://formsubmit.co/ajax/${INBOX}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: SITE,
        Referer: `${SITE}/`,
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    const ok = upstream.ok && String(data.success) === "true";
    if (!ok) {
      console.error("FormSubmit did not accept the message:", upstream.status, data.message);
      return res.status(502).json({ error: "Message could not be delivered", detail: data.message || null });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("send-message failed:", err?.message);
    return res.status(502).json({ error: "Message could not be delivered" });
  }
}
