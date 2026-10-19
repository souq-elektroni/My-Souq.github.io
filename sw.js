/* My Souq Service Worker — network-first, aggressive old-cache purge */
const CACHE_NAME = 'mysouq-v20261019j';
const BUILD = '20261019j';

// Minimal app-shell only (used solely as offline fallback).
const PRECACHE = [
  './manifest.json?v=' + BUILD,
  './styles.css?v=' + BUILD,
  './favicon.svg?v=' + BUILD
];

self.addEventListener('install', (event) => {
  // Activate the new worker immediately — do not wait for old tabs to close.
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
          // Delete every previous My Souq cache (any version).
          .filter((key) => key !== CACHE_NAME && /mysouq|souq/i.test(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => /mysouq|souq/i.test(k)).map((k) => caches.delete(k)))
      )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never let the SW interfere with the version check file.
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // HTML / navigation: pure network-first, NEVER write HTML into cache.
  // This guarantees that after a deploy the next visit always gets the latest HTML.
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    /\.html?$/i.test(url.pathname) ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/My-Souq.github.io');

  if (isHTML) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => res)
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Images: network-first (no-store). Cache only as offline fallback.
  if (req.destination === 'image' || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname)) {
    if (!(sameOrigin || req.destination === 'image')) return;
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

  // CSS / JS: network-first with offline fallback.
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
    return;
  }

  // Everything else (json, fonts, etc.): try network, fall back to cache if offline.
  if (sameOrigin) {
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
