/* DoodleStories Service Worker
 * Strategy:
 *   - HTML + /static/js/* + /static/css/* → Network first (fresh bundles after deploy)
 *   - API + external TTS → Network only (never cache)
 *   - Other assets → Stale while revalidate
 */

const CACHE_NAME = "doodlestories-v3";

const NETWORK_ONLY = [
  "/api/",
  "generativelanguage.googleapis.com",
  "anthropic",
  "formsubmit.co",
];

function isNetworkFirst(request, pathname) {
  return (
    request.mode === "navigate" ||
    pathname === "/" ||
    pathname.endsWith(".html") ||
    pathname.startsWith("/static/js/") ||
    pathname.startsWith("/static/css/")
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  const isNetworkOnly = NETWORK_ONLY.some(
    (pattern) => url.pathname.startsWith(pattern) || url.hostname.includes(pattern)
  );
  if (isNetworkOnly) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNetworkFirst(request, url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
