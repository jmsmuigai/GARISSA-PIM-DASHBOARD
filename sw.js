/* Offline support: network first, falling back to the last saved copy. */
const CACHE = 'gsa-pim-v2';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/i18n.js', 'js/app.js', 'vendor/leaflet.js', 'vendor/leaflet.css',
  'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css', 'vendor/MarkerCluster.Default.css', 'assets/logo-192.png', 'data/projects.json', 'data/county.geojson',
  'data/subcounties.geojson', 'data/wards.geojson', 'data/library_tracker.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
