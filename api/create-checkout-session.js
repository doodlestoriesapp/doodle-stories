// api/create-checkout-session.js
//
// Starts a Stripe checkout. Two important changes from before:
//   1. The device token from the browser is attached as client_reference_id,
//      so when payment completes the webhook knows WHICH device to make premium.
//   2. Only our two real price IDs are accepted, so nobody can start a checkout
//      for an arbitrary price on the account.

import Stripe from "stripe";

// The only two prices the app is allowed to sell. Reject anything else.
const ALLOWED_PRICE_IDS = new Set([
  "price_1TfRHlPQ9TnCZr87tO1waQAy", // monthly
  "price_1TfRHjPQ9TnCZr87yn9DvCCK", // annual
]);

const ALLOWED_ORIGINS = new Set([
  "https://doodlestories.app",
  "https://www.doodlestories.app",
]);

// Where Stripe sends people afterwards. Always the canonical www host.
const SITE_URL = "https://www.doodlestories.app";

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-device-token");
}

function validToken(token) {
  return typeof token === "string" && /^[a-zA-Z0-9-]{10,64}$/.test(token);
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
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
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { priceId } = body || {};

    if (!priceId || !ALLOWED_PRICE_IDS.has(priceId)) {
      return res.status(400).json({ error: "Invalid plan selected" });
    }

    // The device token comes in a header the browser sets.
    const deviceToken = req.headers["x-device-token"];

    const stripe = new Stripe(secretKey);

    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: SITE_URL,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    };

    // Attach the token so the webhook can make the right device premium.
    if (validToken(deviceToken)) {
      sessionParams.client_reference_id = deviceToken;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    if (!session.url) {
      return res.status(500).json({ error: "Failed to create checkout session URL" });
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err?.message ?? err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
