/* My Souq — SW disabled. Self-unregister + wipe caches. */
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
      return self.clients.matchAll({ type: 'window' }).then(function (clients) {
        clients.forEach(function (c) {
          try { c.navigate(c.url); } catch (err) {}
        });
      });
    })
  );
});
self.addEventListener('fetch', function () {
  /* no caching — pass through */
});
