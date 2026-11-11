/* The Vite build replaces this marker with the hashed application assets. */
const ASSETS = "__WEFT_MANIFEST__";
const CACHE = 'weft-shell-' + ASSETS.join('|');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('weft-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      try { return await fetch(request); }
      catch { return (await cache.match('/index.html')) ?? Response.error(); }
    }
    const cached = await cache.match(ASSETS.includes(url.pathname) ? url.pathname : request);
    return cached ?? fetch(request);
  })());
});
