/* My Souq SW — auto-purge old caches, network-only for critical files */
const BUILD = '20261022h';
const CACHE_NAME = 'mysouq-v' + BUILD;

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll([
        './manifest.json?v=' + BUILD,
        './favicon.svg?v=' + BUILD
      ]).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_ALL_CACHES' || data.type === 'PURGE') {
    event.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
    );
  }
});

function networkOnly(req) {
  return fetch(req, { cache: 'no-store' });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var path = url.pathname;

  // Always network for version + critical app files
  var critical =
    /version\.json$/i.test(path) ||
    /\/(index\.html)?$/i.test(path) ||
    /index\.html$/i.test(path) ||
    /script\.js$/i.test(path) ||
    /styles\.css$/i.test(path) ||
    /sw\.js$/i.test(path);

  var isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1 ||
    /\.html?$/i.test(path) ||
    path.endsWith('/');

  if (critical || isHTML) {
    event.respondWith(
      networkOnly(req).catch(function () {
        return caches.match(req).then(function (c) { return c || Response.error(); });
      })
    );
    return;
  }

  if (!sameOrigin) return;

  // Other assets: network-first, cache only as offline fallback
  event.respondWith(
    networkOnly(req)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (c) { return c || Response.error(); });
      })
  );
});
