var CACHE = 'task-manager-v2';
var STATIC = [
  '/task-manager-pwa/',
  '/task-manager-pwa/index.html',
  '/task-manager-pwa/css/style.css',
  '/task-manager-pwa/js/app.js',
  '/task-manager-pwa/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(STATIC);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.pathname.indexOf('/task-manager-pwa/') === -1) return;
  if (url.hostname === 'tufwud.github.io' && url.pathname.indexOf('task-manager-pwa') !== -1) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return fetch(e.request).then(function(resp) {
          if (resp && resp.ok) {
            var copy = resp.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, copy); });
          }
          return resp || cached;
        }).catch(function() { return cached; });
      })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function(cached) { return cached || fetch(e.request); })
    );
  }
});
