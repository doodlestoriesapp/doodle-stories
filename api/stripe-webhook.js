// api/stripe-webhook.js
//
// Receives events from Stripe and records who is premium.
//
// The key idea: at checkout the browser sends a random "device token"
// (client_reference_id). When payment completes, we store premium status
// against THAT token, plus a reverse map from the Stripe customer back to the
// token — because later events (renewals, cancellations) only carry the
// customer id, not the token, so we need a way to look the token back up.
//
// Keys written in Redis:
//   premium:{token}      -> { status, customerId, updatedAt }   (what the app reads)
//   customer:{customerId} -> token                              (reverse lookup)

import Stripe from "stripe";
import { Redis } from "@upstash/redis";

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body to verify the signature
  },
};

// A subscription in any of these states counts as premium. "past_due" is kept
// so a family isn't cut off mid-way through Stripe's payment-retry window, and
// "trialing" covers any future free-trial offer.
const PREMIUM_STATUSES = new Set(["active", "trialing", "past_due"]);

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL or KV_REST_API_TOKEN is not configured");
  }
  return new Redis({ url, token });
}

// Stripe sometimes gives customer as a string, sometimes as an expanded object.
function customerIdOf(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
}

async function setPremium(redis, token, customerId, status) {
  if (!token) return;
  await redis.set(`premium:${token}`, { status, customerId, updatedAt: Date.now() });
  if (customerId) {
    await redis.set(`customer:${customerId}`, token);
  }
}

async function clearPremium(redis, token, customerId) {
  if (token) {
    await redis.set(`premium:${token}`, { status: "canceled", customerId, updatedAt: Date.now() });
  }
}

// Given a Stripe customer id, find the device token we stored for them.
async function tokenForCustomer(redis, customerId) {
  if (!customerId) return null;
  const token = await redis.get(`customer:${customerId}`);
  return typeof token === "string" ? token : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey || !webhookSecret) {
      console.error("stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
      return res.status(500).json({ error: "Stripe webhook is not configured" });
    }

    const stripe = new Stripe(secretKey);
    const redis = getRedis();

    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).send("Missing stripe-signature header");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("stripe-webhook signature verification failed:", err?.message ?? err);
      return res.status(400).send(`Webhook Error: ${err?.message ?? "Invalid signature"}`);
    }

    switch (event.type) {
      // Fired when checkout finishes. This is the ONLY event that carries our
      // device token (as client_reference_id), so this is where we establish
      // the token <-> customer link.
      case "checkout.session.completed": {
        const session = event.data.object;
        const token = session.client_reference_id;
        const customerId = customerIdOf(session.customer);

        // Only treat as paid if payment actually went through. Async payment
        // methods can complete the session while still "unpaid".
        if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
          await setPremium(redis, token, customerId, "active");
        }
        break;
      }

      // Some payment methods confirm payment after the session completes.
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const token = session.client_reference_id;
        const customerId = customerIdOf(session.customer);
        await setPremium(redis, token, customerId, "active");
        break;
      }

      // Renewals, plan changes, cancellations at period end, dunning, etc.
      // These do NOT carry the token, so we look it up via the customer id.
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = customerIdOf(subscription.customer);
        const token = await tokenForCustomer(redis, customerId);
        if (!token) break; // no known device for this customer; nothing to update

        const isDeleted = event.type === "customer.subscription.deleted";
        if (!isDeleted && PREMIUM_STATUSES.has(subscription.status)) {
          await setPremium(redis, token, customerId, subscription.status);
        } else {
          await clearPremium(redis, token, customerId);
        }
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripe-webhook error:", err?.message ?? err);
    // Return 500 so Stripe retries — better to reprocess than to silently drop.
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
