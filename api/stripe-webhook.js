import Stripe from "stripe";
import { Redis } from "@upstash/redis";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

async function setPremium(redis, customerId) {
  if (!customerId) return;
  await redis.set(`premium:${customerId}`, "active");
}

async function clearPremium(redis, customerId) {
  if (!customerId) return;
  await redis.del(`premium:${customerId}`);
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
      case "checkout.session.completed": {
        const session = event.data.object;
        await setPremium(redis, session.customer);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await clearPremium(redis, subscription.customer);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        if (subscription.status === "active") {
          await setPremium(redis, subscription.customer);
        } else {
          await clearPremium(redis, subscription.customer);
        }
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripe-webhook error:", err?.message ?? err);
    return res.status(500).json({
      error: err?.message ?? "Webhook handler failed",
    });
  }
}
