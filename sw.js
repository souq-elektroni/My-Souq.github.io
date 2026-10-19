/* My Souq Service Worker — network-first for HTML/assets, versioned cache */
const CACHE_NAME = 'mysouq-v20261019a';

// Keep app shell resources available for offline use; URLs use the same build as index.html.
const PRECACHE = [
  './manifest.json?v=20261019a',
  './styles.css?v=20261019a',
  './favicon.svg?v=20261019a'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => /^mysouq[-_]/i.test(key) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheableRequest = sameOrigin || req.destination === 'image';

  // HTML / navigation: always try the network first so visitors receive current site code.
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    /\.html?$/i.test(url.pathname) ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/My-Souq.github.io');

  if (isHTML) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok && sameOrigin) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Images: network-first to avoid old product photos; cached copy remains an offline fallback.
  if (req.destination === 'image' || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname)) {
    if (!cacheableRequest) return;
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || Response.error()))
    );
    return;
  }

  // CSS / JS: network-first, with cache fallback when offline.
  if (/\.(css|js)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || Response.error()))
    );
  }
});
