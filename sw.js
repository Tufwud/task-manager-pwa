// Self-destruct: unregister this SW and delete all caches
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      // Clear all clients
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(c) { c.navigate(c.url); });
      });
    })
  );
});
self.addEventListener('fetch', function(e) {
  e.respondWith(fetch(e.request));
});
