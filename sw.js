// Offline cache. Precached files are served cache-only, so a running version is never mixed with a newer deploy:
// a new sw.js (bump V on every deploy) installs the whole file set into a fresh cache and swaps it in atomically.
const V = 'flycorp-v2';
const FILES = ['./', 'index.html', 'game.js', 'cities.js', 'legacy-ids.js', 'world.js', 'manifest.json', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { cacheName: V, ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
