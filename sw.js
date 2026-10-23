/* My Souq SW — disabled cache, self-unregister — 20261023173424CACHEKILL */
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
// لا تكاش أي طلب
self.addEventListener('fetch', function (e) {
  e.respondWith(fetch(e.request));
});
