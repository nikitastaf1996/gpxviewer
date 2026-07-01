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
    './icon-512.png',
    // Vendored third-party libraries — now local, so always available offline.
    './vendor/leaflet/leaflet.css',
    './vendor/leaflet/leaflet.js',
    './vendor/leaflet/images/marker-icon.png',
    './vendor/leaflet/images/marker-icon-2x.png',
    './vendor/leaflet/images/marker-shadow.png',
    './vendor/leaflet/images/layers.png',
    './vendor/leaflet/images/layers-2x.png',
    './vendor/leaflet-fullscreen/leaflet.fullscreen.css',
    './vendor/leaflet-fullscreen/Leaflet.fullscreen.min.js',
    './vendor/leaflet-fullscreen/fullscreen.png',
    './vendor/leaflet-fullscreen/fullscreen@2x.png',
    './vendor/leaflet-gpx/gpx.min.js',
    './vendor/leaflet-gpx/pin-icon-start.png',
    './vendor/leaflet-gpx/pin-icon-end.png',
    './vendor/leaflet-gpx/pin-shadow.png',
    './vendor/chartjs/chart.umd.min.js',
    './vendor/jszip/jszip.min.js',
    './vendor/alpine/cdn.min.js',
    './vendor/alpine/collapse.min.js'
];

// Cross-origin CDN assets — best-effort. Tolerate individual failures so a
// single flaky CDN edge doesn't permanently disable offline mode.
// (Currently empty since all third-party deps are vendored locally. Kept as
// a list so future cross-origin resources can be added without restructuring.)
const CDN_ASSETS = [];

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

    // Never let the SW intercept:
    //   - Nominatim reverse-geocoding requests (per-coordinate, freshness matters,
    //     Nominatim usage policy discourages aggressive caching, and Playwright
    //     page.route mocks won't fire if the SW grabs these first).
    //   - OSM map tile requests (handled by the OfflineTileLayer's own IndexedDB
    //     cache in offline-tiles.js; SW interception would bypass that layer and
    //     also break Playwright mocks for tile fetches in tests).
    //   - Any request that explicitly opts out via a `x-skip-sw` header.
    const isNominatim = url.hostname === 'nominatim.openstreetmap.org';
    const isOsmTile = url.hostname.endsWith('.tile.openstreetmap.org');
    if (isNominatim || isOsmTile) {
        // Let the browser handle it directly — the OfflineTileLayer caches
        // tiles in IndexedDB; the geocoder just calls fetch().
        return;
    }

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
