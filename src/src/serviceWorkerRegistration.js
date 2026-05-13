// src/serviceWorkerRegistration.js
// Registers the DoodleStories service worker for PWA support.

const SW_URL = `${process.env.PUBLIC_URL}/service-worker.js`;

export function register() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(SW_URL)
        .then((registration) => {
          console.log("[SW] Registered:", registration.scope);

          // Check for updates every time the app loads
          registration.onupdatefound = () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.onstatechange = () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                // New version available — notify user
                console.log("[SW] New version available");
                if (window.confirm("A new version of DoodleStories is available! Reload to update?")) {
                  worker.postMessage("skipWaiting");
                  window.location.reload();
                }
              }
            };
          };
        })
        .catch((err) => console.error("[SW] Registration failed:", err));
    });
  }
}

export function unregister() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((r) => r.unregister())
      .catch((err) => console.error(err));
  }
}
