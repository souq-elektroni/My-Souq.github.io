/* My Souq — SW permanently disabled. Build: 202610222053x */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.registration.unregister(); })
      .then(function () {
        return self.clients.matchAll({ type: 'window' }).then(function (clients) {
          clients.forEach(function (c) {
            try {
              var u = c.url.split('#')[0];
              c.navigate(u + (u.indexOf('?') >= 0 ? '&' : '?') + 'nocache=' + Date.now());
            } catch (err) {}
          });
        });
      })
  );
});
self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(function () {
    return fetch(event.request);
  }));
});
