// Service Worker — offline support for Mega Trend Portfolio
// v3: fixes "Response served by service worker has redirections" on iOS —
// Cloudflare Pages 308-redirects /index.html -> /, and Safari refuses a
// navigation response whose .redirected flag is true. We never precache
// the redirect-prone "./index.html" URL, and we strip the flag on any
// response before it's cached or returned.
const CACHE = "megaport-v4";
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live data (our proxy / yahoo / public proxies): network-first, fall back to last cached
  const isData =
    url.pathname.includes("/api/chart") ||
    url.pathname.includes("/api/eps") ||
    url.hostname.includes("yahoo") ||
    url.search.includes("yahoo");
  if (isData) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Same-origin app shell: stale-while-revalidate (cache-first + background refresh)
  if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req));
  }
});

// Safari rejects a service-worker response for navigation requests if it
// carries a redirect chain (Response.redirected === true). Rebuild a plain
// Response from the body so the flag is gone before it's cached/returned.
async function stripRedirect(res) {
  if (!res || !res.redirected) return res;
  const body = await res.clone().blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await stripRedirect(await fetch(req));
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) {
      // tag as cached so the UI can show "offline / last known"
      const headers = new Headers(cached.headers);
      headers.set("x-from-cache", "1");
      return new Response(await cached.blob(), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: "offline", offline: true }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then(stripRedirect)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || cache.match("./");
}
