const CACHE_NAME = "ict-screening-v98";
const SHELL_FILES = [
  "./index.html",
  "./engine/trend.js",
  "./app/storage.js",
  "./app/market.js",
  "./app/tracker.js",
  "./app/live.js",
  "./app/marketdata.js",
  "./app/ui.js",
  "./app/main.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
];

// Shell dan modul aplikasi memakai network-first, dengan fallback offline.
const NETWORK_FIRST_FILES = ["index.html", "manifest.json", "engine/trend.js", "app/storage.js", "app/market.js", "app/tracker.js", "app/live.js", "app/marketdata.js", "app/ui.js", "app/main.js"];

// Origin lintas-domain yang tetap boleh di-cache karena memang bagian dari shell app (font UI).
// Selain ini + origin sendiri, TIDAK ADA yang boleh disentuh cache — lihat catatan di handler fetch.
const CACHEABLE_CROSS_ORIGIN = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  // Cache cuma ngerti GET. Request POST — mis. notifikasi Telegram ke api.telegram.org — dulu jatuh ke
  // cabang cache-first di bawah, dan cache.put() menolak request POST, jadi tiap kirim notif ninggalin
  // unhandled rejection di console (pesannya sendiri tetap terkirim). Sekarang non-GET nggak diintersepsi.
  if (req.method !== "GET") return;

  // Data live Binance (REST + WebSocket): jangan pernah disentuh cache. Dilewatkan tanpa respondWith
  // sekalian, biar nggak ada perjalanan bolak-balik lewat service worker yang nggak ada gunanya.
  if (url.includes("fapi.binance.com") || url.includes("fstream.binance.com")) return;

  let sameOrigin = false;
  try { sameOrigin = new URL(url).origin === self.location.origin; } catch (e) { /* URL aneh — anggap bukan */ }

  const isNetworkFirst =
    sameOrigin && (NETWORK_FIRST_FILES.some((f) => url.endsWith(f)) || url.endsWith("/"));

  if (isNetworkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
    );
    return;
  }

  // Cache aset lokal dan font; layanan eksternal lain diteruskan langsung.
  if (!sameOrigin && !CACHEABLE_CROSS_ORIGIN.some((o) => url.startsWith(o))) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        }).catch(() => cached)
      );
    })
  );
});
