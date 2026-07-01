// Service worker for GPX Viewer.
//
// Strategy:
//   - Install: cache CRITICAL (same-origin) assets. Failures here fail the
//     install (we cannot work offline without our own JS/CSS). CDN_ASSETS are
//     best-effort: a single flaky CDN response does NOT block installation.
//   - Activate: clear old caches, then clients.claim() so this SW takes
//     control on the very first navigation (no reload required).
//   - Fetch:
//       * Same-origin GET → stale-while-revalidate.
//         Respond from cache immediately; fetch in the background and update
//         the cache. This guarantees eventual consistency: users see the old
//         version once, then the new version on the next load — no manual
//         cache-name bumping required.
//       * Cross-origin GET (CDN assets, Nominatim) → network-first with cache
//         fallback. Freshness matters more than speed for these; if the network
//         is down, fall back to whatever we have cached.
//       * Non-GET / opaque responses → pass through to the network.

const CACHE_NAME = 'gpx-viewer-v1';

// Same-origin assets — required for offline use. If any of these fail to
// cache during install, the install fails (intentional: we'd rather have no
// SW than a SW that pretends to work but is missing core files).
const CRITICAL_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './js/db.js',
    './js/gpx-utils.js',
    './js/geocoder.js',
    './js/store.js',
    './js/components/analyze.js',
    './js/components/library.js',
    './js/components/settings.js',
    './js/components/trends.js',
    './js/components/workspace.js',
    './js/main.js',
    './js/offline-tiles.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Cross-origin CDN assets — best-effort. Tolerate individual failures so a
// single flaky CDN edge doesn't permanently disable offline mode.
const CDN_ASSETS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://api.mapbox.com/mapbox.js/plugins/leaflet-fullscreen/v1.0.1/leaflet.fullscreen.css',
    'https://api.mapbox.com/mapbox.js/plugins/leaflet-fullscreen/v1.0.1/Leaflet.fullscreen.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/2.1.0/gpx.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js',
    'https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js',
    'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
    'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
    'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png'
];

self.addEventListener('install', (event) => {
    console.log('SW install event');
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        console.log('Caching critical assets');
        // Critical: any failure rejects → install fails.
        await Promise.all(CRITICAL_ASSETS.map(a => cache.add(a)));
        console.log('Caching CDN assets (best-effort)');
        // CDN: best-effort. Log failures but don't fail install.
        const results = await Promise.allSettled(CDN_ASSETS.map(a => cache.add(a)));
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.warn('SW: failed to cache CDN asset (non-fatal):', CDN_ASSETS[i], r.reason);
            }
        });
    })());
});

self.addEventListener('activate', (event) => {
    console.log('SW activate event');
    event.waitUntil((async () => {
        // Clear old caches.
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        );
        // Take control of all open clients immediately so the SW applies on
        // the first navigation rather than only after a reload.
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;

    if (sameOrigin) {
        // Stale-while-revalidate.
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(req);
            const networkPromise = fetch(req).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    cache.put(req, response.clone()).catch(() => {});
                }
                return response;
            }).catch(() => null);
            // Serve from cache if available, else wait for network.
            return cached || networkPromise.then(r => r || new Response('Offline', {
                status: 503,
                statusText: 'Offline'
            }));
        })());
    } else {
        // Cross-origin: network-first with cache fallback.
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const response = await fetch(req);
                // Only cache successful, non-opaque responses that we can read.
                if (response && response.status === 200) {
                    cache.put(req, response.clone()).catch(() => {});
                }
                return response;
            } catch (err) {
                const cached = await cache.match(req);
                if (cached) return cached;
                throw err;
            }
        })());
    }
});
