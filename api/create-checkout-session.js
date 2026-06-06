import Stripe from "stripe";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("create-checkout-session: STRIPE_SECRET_KEY is not configured");
    return res.status(500).json({ error: "Stripe is not configured" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { priceId, userEmail } = body || {};

    if (!priceId || typeof priceId !== "string") {
      return res.status(400).json({ error: "priceId is required" });
    }

    const stripe = new Stripe(secretKey);

    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:
        "https://www.doodlestories.app/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://www.doodlestories.app",
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    };

    if (userEmail && typeof userEmail === "string") {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return res.status(500).json({ error: "Failed to create checkout session URL" });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err?.message ?? err);
    return res.status(500).json({
      error: err?.message ?? "Failed to create checkout session",
    });
  }
}
