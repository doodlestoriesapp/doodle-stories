/* DoodleStories Service Worker
 * Strategy:
 *   - App shell (HTML, JS, CSS) → Cache First (fast loads)
 *   - API calls (generate-story, tts, Google) → Network Only (always fresh)
 *   - Images/assets → Stale While Revalidate (fast + stays fresh)
 */

const CACHE_NAME = "doodlestories-v1";
const CACHE_VERSION = 1;

const APP_SHELL = [
  "/",
  "/index.html",
  "/static/js/main.chunk.js",
  "/static/js/bundle.js",
  "/static/css/main.chunk.css",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Never cache these — always go to network
const NETWORK_ONLY = [
  "/api/",
  "generativelanguage.googleapis.com",
  "anthropic",
  "formsubmit.co",
];

// ── Install: pre-cache app shell ──────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching app shell");
      // Use addAll with individual error handling so one failure doesn't block install
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn("[SW] Failed to cache:", url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ───────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Network Only: API calls and external services
  const isNetworkOnly = NETWORK_ONLY.some(
    (pattern) => url.pathname.startsWith(pattern) || url.hostname.includes(pattern)
  );
  if (isNetworkOnly) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache First: HTML navigation (app shell)
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then(
        (cached) => cached || fetch(request)
      )
    );
    return;
  }

  // Stale While Revalidate: JS, CSS, images, fonts
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // fall back to cache if offline

      return cached || fetchPromise;
    })
  );
});

// ── Background sync: notify clients of updates ───────────────────
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
