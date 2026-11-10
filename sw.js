/* My Souq SW — PWA + Admin Notifications — 202611101435adminNotif */
var SW_BUILD = '202611101435adminNotif';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // امسح أي كاش قديم — الشبكة أولًا دائمًا
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// شبكة أولًا — بدون تخزين صفحات عشان متظهرش نسخة قديمة
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req, { cache: 'no-store' }).catch(function () {
      return fetch(req);
    })
  );
});

// إشعارات من الصفحة (admin)
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data && data.type === 'SHOW_ADMIN_ORDER_NOTIFICATION') {
    var title = data.title || 'طلب جديد — My Souq';
    var body = data.body || '';
    var tag = data.tag || ('order-' + Date.now());
    var options = {
      body: body,
      icon: 'images/icon-192.png',
      badge: 'images/icon-192.png',
      tag: tag,
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: data.url || './', orderId: data.orderId || '' },
      silent: false
    };
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url && 'focus' in c) {
          c.postMessage({ type: 'ADMIN_NOTIF_CLICK', orderId: (event.notification.data && event.notification.data.orderId) || '' });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
