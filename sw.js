const CACHE_NAME = 'gpx-viewer-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/2.1.0/gpx.min.js',
  'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
  'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
  'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png'
];

self.addEventListener('install', (event) => {
  console.log('SW install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching assets');
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('SW activate event');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
