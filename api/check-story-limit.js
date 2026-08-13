// api/check-story-limit.js
//
// Tells the app two things: how many stories this visitor has made this month,
// and whether they are premium.
//
// Premium is looked up by the "device token" the app sends in the
// x-device-token header. If the token has an active premium record (written by
// the Stripe webhook), the story limit doesn't apply.

import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

const STORY_LIMIT = 10;
const KEY_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days, matches the privacy policy

const ALLOWED_ORIGINS = new Set([
  "https://doodlestories.app",
  "https://www.doodlestories.app",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-device-token");
}

function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL or KV_REST_API_TOKEN is not configured");
  }
  return new Redis({ url, token });
}

// Vercel sets x-vercel-forwarded-for itself; a caller cannot forge it.
function getClientIp(req) {
  const vercelIp = req.headers["x-vercel-forwarded-for"];
  if (vercelIp) return String(vercelIp).split(",")[0].trim();
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim();
  return req.socket?.remoteAddress || "unknown";
}

function getYearMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function hashIp(ip, yearMonth) {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) throw new Error("IP_HASH_SALT is not configured");
  return crypto
    .createHash("sha256")
    .update(`${salt}:${yearMonth}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

function validToken(token) {
  return typeof token === "string" && /^[a-zA-Z0-9-]{10,64}$/.test(token);
}

async function isPremiumToken(redis, token) {
  if (!validToken(token)) return false;
  const record = await redis.get(`premium:${token}`);
  if (!record) return false;
  // record is { status, customerId, updatedAt }
  const status = typeof record === "string" ? record : record.status;
  return status === "active" || status === "trialing" || status === "past_due";
}

function buildResponse(count, isPremium) {
  return {
    count,
    limit: STORY_LIMIT,
    isPremium,
    canGenerate: isPremium || count < STORY_LIMIT,
  };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const redis = getRedis();
    const deviceToken = req.headers["x-device-token"];
    const isPremium = await isPremiumToken(redis, deviceToken);

    // Premium users skip the counter entirely.
    if (isPremium) {
      return res.status(200).json(buildResponse(0, true));
    }

    const ip = getClientIp(req);
    const ym = getYearMonth();
    const key = `stories:${hashIp(ip, ym)}:${ym}`;

    if (req.method === "GET") {
      const raw = await redis.get(key);
      const count = raw != null ? Number(raw) : 0;
      return res.status(200).json(buildResponse(Number.isFinite(count) ? count : 0, false));
    }

    // POST increments (kept for compatibility; generate-story does its own
    // atomic increment, so this path is rarely used).
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, KEY_TTL_SECONDS);
    return res.status(200).json(buildResponse(count, false));
  } catch (err) {
    console.error("check-story-limit error:", err?.message ?? err);
    // Fail open for reads so an outage doesn't block a child mid-story.
    if (req.method === "GET") {
      return res.status(200).json(buildResponse(0, false));
    }
    return res.status(500).json({ error: "Failed to update story limit", ...buildResponse(0, false) });
  }
}
