import { getDeviceId } from "./storage";

// "www." matters: doodlestories.app redirects to www.doodlestories.app,
// and calling the final address directly saves a round-trip on every request.
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.doodlestories.app").replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiPost(path, body) {
  // The device ID lets the server recognise a premium install (see storage.js).
  let deviceId = null;
  try {
    deviceId = await getDeviceId();
  } catch {
    // Send the request anyway; the server just applies the free limit.
  }

  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(deviceId ? { "x-device-token": deviceId } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
