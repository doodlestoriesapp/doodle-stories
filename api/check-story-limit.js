import { Redis } from "@upstash/redis";

const STORY_LIMIT = 10;
const KEY_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
}

function getYearMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildResponse(count) {
  const isPremium = false;
  return {
    count,
    limit: STORY_LIMIT,
    isPremium,
    canGenerate: count < STORY_LIMIT,
  };
}

function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL or KV_REST_API_TOKEN is not configured");
  }
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const redis = getRedis();
    const ip = getClientIp(req);
    const key = `stories:${ip}:${getYearMonth()}`;

    if (req.method === "GET") {
      const raw = await redis.get(key);
      const count = raw != null ? Number(raw) : 0;
      return res.status(200).json(buildResponse(Number.isFinite(count) ? count : 0));
    }

    const count = await redis.incr(key);
    await redis.expire(key, KEY_TTL_SECONDS);
    return res.status(200).json(buildResponse(count));
  } catch (err) {
    console.error("check-story-limit error:", err?.message ?? err);

    if (req.method === "GET") {
      return res.status(200).json(buildResponse(0));
    }

    return res.status(500).json({
      error: err?.message ?? "Failed to update story limit",
      ...buildResponse(0),
    });
  }
}
