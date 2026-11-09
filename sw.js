/* My Souq SW — disabled cache, self-unregister — 202611091309cacheFix */
self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.registration.unregister();
    }).then(function () {
      return self.clients.matchAll();
    }).then(function (clients) {
      clients.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
    })
  );
});
self.addEventListener('fetch', function (e) {
  e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(function () {
    return fetch(e.request);
  }));
});
