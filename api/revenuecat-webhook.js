// api/revenuecat-webhook.js
//
// Receives events from RevenueCat (Android / Google Play subscriptions) and
// records who is premium, in the SAME place the Stripe webhook does:
//
//   premium:{token} -> { status, source, entitlementExpiresAt, updatedAt }
//
// /api/generate-story already reads that key (via the x-device-token header)
// to skip the free-story limit, so nothing else on the server needs to change.
//
// How it works:
//   1. The app uses one random ID per install as BOTH its RevenueCat user ID
//      and its x-device-token. So a RevenueCat user ID == a premium token.
//   2. RevenueCat calls this endpoint on every purchase, renewal, cancellation,
//      expiry, restore (TRANSFER), etc.
//   3. Instead of interpreting each event type, we ask RevenueCat for the
//      customer's CURRENT entitlement (RevenueCat's recommended approach) and
//      write that. This handles every event type the same way and is safe to
//      run twice for the same event.
//   4. Active records get a Redis expiry matching the subscription's end date,
//      so premium switches off by itself even if an expiry event is missed.
//
// Environment variables (set in Vercel):
//   KV_REST_API_URL, KV_REST_API_TOKEN  (already set)
//   REVENUECAT_WEBHOOK_AUTH   any long random string; the same value goes in
//                             RevenueCat → Integrations → Webhooks →
//                             "Authorization header value"
//   REVENUECAT_SECRET_KEY     a RevenueCat secret API key, API version V1
//                             (starts with sk_). Server-side only.

import { Redis } from "@upstash/redis";

// Must match the entitlement identifier in RevenueCat exactly (space and
// capital P included).
const ENTITLEMENT_ID = "doodlestories Premium";

// Same rule generate-story.js uses to accept an x-device-token.
const TOKEN_RE = /^[a-zA-Z0-9-]{10,64}$/;

// Keep a "canceled" record around briefly for debugging, then let it vanish.
const INACTIVE_TTL_SECONDS = 30 * 24 * 60 * 60;

function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL or KV_REST_API_TOKEN is not configured");
  }
  return new Redis({ url, token });
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body || {};
}

// Constant-time string comparison, so the auth check can't be timed.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Every ID this event could affect. A restore (TRANSFER) moves the purchase
// from one install's ID to another's, so both sides need refreshing.
function affectedIds(event) {
  const ids = new Set();
  const add = (v) => {
    if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === "string" && TOKEN_RE.test(v)) ids.add(v);
  };
  add(event.app_user_id);
  add(event.original_app_user_id);
  add(event.aliases);
  add(event.transferred_from);
  add(event.transferred_to);
  return [...ids];
}

// Ask RevenueCat when this customer's premium access ends.
// Returns { active, expiresAtMs } — expiresAtMs is null for non-expiring access.
async function fetchEntitlement(appUserId) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY is not configured");

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`RevenueCat lookup failed (${res.status})`);

  const data = await res.json();
  const ent = data?.subscriber?.entitlements?.[ENTITLEMENT_ID];
  if (!ent) return { active: false, expiresAtMs: null };

  // Access lasts until the later of the paid period and any billing grace period.
  const ends = [ent.expires_date, ent.grace_period_expires_date]
    .filter(Boolean)
    .map((d) => Date.parse(d))
    .filter((n) => Number.isFinite(n));

  if (ent.expires_date === null && ends.length === 0) {
    return { active: true, expiresAtMs: null }; // non-expiring
  }
  const expiresAtMs = ends.length ? Math.max(...ends) : 0;
  return { active: expiresAtMs > Date.now(), expiresAtMs };
}

async function writeStatus(redis, token, { active, expiresAtMs }) {
  const record = {
    status: active ? "active" : "canceled",
    source: "revenuecat",
    entitlementExpiresAt: expiresAtMs,
    updatedAt: Date.now(),
  };

  if (active && expiresAtMs) {
    const seconds = Math.max(60, Math.ceil((expiresAtMs - Date.now()) / 1000));
    await redis.set(`premium:${token}`, record, { ex: seconds });
  } else if (active) {
    await redis.set(`premium:${token}`, record);
  } else {
    await redis.set(`premium:${token}`, record, { ex: INACTIVE_TTL_SECONDS });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // ── Only RevenueCat may call this ───────────────────────────────
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error("REVENUECAT_WEBHOOK_AUTH is not configured");
    return res.status(500).json({ error: "Webhook is not configured" });
  }
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(provided, expected.replace(/^Bearer\s+/i, ""))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const event = parseBody(req).event;
    if (!event || typeof event !== "object") {
      return res.status(400).json({ error: "Missing event" });
    }

    // The dashboard's "Send test event" uses a made-up user — just confirm receipt.
    if (event.type === "TEST") {
      return res.status(200).json({ received: true, test: true });
    }

    const ids = affectedIds(event);
    if (ids.length === 0) {
      // e.g. an anonymous RevenueCat ID ($RCAnonymousID:…) — nothing we can key on.
      console.warn("RevenueCat event with no usable app user ID", event.type, event.id);
      return res.status(200).json({ received: true, updated: 0 });
    }

    const redis = getRedis();
    for (const id of ids) {
      const status = await fetchEntitlement(id);
      await writeStatus(redis, id, status);
    }

    return res.status(200).json({ received: true, updated: ids.length });
  } catch (err) {
    // A non-200 makes RevenueCat retry (5, 10, 20, 40, 80 minutes later).
    console.error("RevenueCat webhook failed:", err?.message || err);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
