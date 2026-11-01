// Ludo Live offline support. Keeps a copy of the game, its fonts and icons on the device.
const VERSION = "ludo-39396f6019";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png", "./apple-touch-icon.png"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Figtree:wght@400;500;600;700&display=swap";
const FIREBASE = ["app", "auth", "firestore"].map(n => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}-compat.js`);

async function saveFonts(cache) {
  try {
    const res = await fetch(FONT_CSS, { mode: "cors" });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(files.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && cache.put(u, r)).catch(() => {})));
  } catch (e) {}
}
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: "reload" })));
    await saveFonts(cache);
    await Promise.all(FIREBASE.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {})));
  })());
});
self.addEventListener("message", e => { if (e.data === "activate") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // The page and its config open instantly from the saved copy. A new version is fetched by the
  // browser's own update check (sw.js changes with every build) and offered with an Update prompt.
  if (sameOrigin && (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.endsWith("config.js"))) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const key = req.mode === "navigate" || url.pathname.endsWith("/") ? "./index.html" : req;
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) cache.put(key, res.clone()); return res; }
      catch (err) { return Response.error(); }
    })());
    return;
  }
  // Fonts, icons and the Firebase scripts: saved copy first, refreshed in the background.
  const cacheable = sameOrigin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.href.startsWith("https://www.gstatic.com/firebasejs/");
  if (!cacheable) return;   // live game traffic (Firestore, sign-in) goes straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreVary: true });
    const fresh = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || Response.error();
  })());
});
