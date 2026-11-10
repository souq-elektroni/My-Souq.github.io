/* My Souq SW — PWA + FCM + Admin Notifications — 202611101504fcm */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

try {
  firebase.initializeApp({
    apiKey: "AIzaSyD9M29F0mLh0f8wMOAxULvlq7Ccr7hMMgQ",
    authDomain: "my-souq0.firebaseapp.com",
    projectId: "my-souq0",
    storageBucket: "my-souq0.firebasestorage.app",
    messagingSenderId: "334605657240",
    appId: "1:334605657240:web:6598cf95d6a010ea855ced"
  });
  var messaging = firebase.messaging();
  messaging.onBackgroundMessage(function (payload) {
    var n = (payload && payload.notification) || {};
    var d = (payload && payload.data) || {};
    var title = n.title || d.title || '🛍️ طلب جديد — My Souq';
    var body = n.body || d.body || [d.orderId, d.name, d.total].filter(Boolean).join(' · ');
    self.registration.showNotification(title, {
      body: body,
      icon: 'images/icon-192.png',
      badge: 'images/icon-192.png',
      tag: 'msq-order-' + (d.orderId || Date.now()),
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: './', orderId: d.orderId || '' }
    });
  });
} catch (e) {
  console.warn('FCM SW init', e);
}

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(function () { return fetch(e.request); }));
});
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data && data.type === 'SHOW_ADMIN_ORDER_NOTIFICATION') {
    event.waitUntil(self.registration.showNotification(data.title || 'طلب جديد — My Souq', {
      body: data.body || '',
      icon: 'images/icon-192.png',
      badge: 'images/icon-192.png',
      tag: data.tag || ('order-' + Date.now()),
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || './', orderId: data.orderId || '' }
    }));
  }
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url && 'focus' in clientList[i]) {
          try { clientList[i].postMessage({ type: 'ADMIN_NOTIF_CLICK', orderId: (event.notification.data && event.notification.data.orderId) || '' }); } catch (e) {}
          return clientList[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
