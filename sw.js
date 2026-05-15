var CACHE = 'tms-v1';
var URLS = [
  'index.html',
  'css/style.css',
  'js/app.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf('http') !== 0) return;
  e.respondWith(
    caches.match(e.request).then(function(resp) {
      return resp || fetch(e.request).then(function(netResp) {
        if (netResp && netResp.status === 200 && URLS.some(function(u) { return e.request.url.indexOf(u) > -1; })) {
          var copy = netResp.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, copy); });
        }
        return netResp;
      });
    }).catch(function() {
      return new Response('Offline', { status: 503 });
    })
  );
});
