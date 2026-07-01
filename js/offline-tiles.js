/**
 * OfflineTileLayer — a Leaflet tile layer that caches tiles in IndexedDB.
 *
 * Strategy:
 *   - On tile request, check IndexedDB for `z/x/y`.
 *   - If cached and fresh (< 30 days), use the cached blob.
 *   - If cached but stale, use the cached blob AND revalidate in background.
 *   - If not cached, fetch from network; on success, cache. On failure (offline),
 *     leave the tile blank — the user sees a grey cell, not an error.
 *   - If a put fails with QuotaExceededError, evict the oldest 20% of tiles
 *     and retry the put once.
 *
 * The tile cache lives in its own database (GpxViewerTilesDB) so it can be
 * cleared independently of run data.
 *
 * Usage:
 *   L.tileLayer.offline(url, options)
 *   — same API as L.tileLayer.
 */
(function () {
    const TILE_DB_NAME = 'GpxViewerTilesDB';
    const TILE_DB_VERSION = 1;
    const TILE_STORE = 'tiles';
    const TILE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    let tileDbPromise = null;

    function openTileDb() {
        if (tileDbPromise) return tileDbPromise;
        tileDbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(TILE_DB_NAME, TILE_DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(TILE_STORE)) {
                    db.createObjectStore(TILE_STORE); // key: "z/x/y"
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
        return tileDbPromise;
    }

    function getTile(key) {
        return openTileDb().then(db => new Promise((resolve) => {
            try {
                const tx = db.transaction([TILE_STORE], 'readonly');
                const r = tx.objectStore(TILE_STORE).get(key);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        }));
    }

    function putTile(key, blob) {
        return openTileDb().then(db => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction([TILE_STORE], 'readwrite');
                tx.objectStore(TILE_STORE).put({ blob, ts: Date.now() }, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            } catch (e) { reject(e); }
        }));
    }

    // Evict the oldest 20% of cached tiles. Used when putTile hits QuotaExceededError.
    function evictOldest20Percent() {
        return openTileDb().then(db => new Promise((resolve) => {
            try {
                const tx = db.transaction([TILE_STORE], 'readwrite');
                const store = tx.objectStore(TILE_STORE);
                const allReq = store.getAll();
                allReq.onsuccess = () => {
                    const entries = allReq.result || [];
                    // entries are values; we don't have keys here. Use a cursor instead.
                    const cursorReq = store.openCursor();
                    const items = [];
                    cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            items.push({ key: cursor.key, ts: cursor.value && cursor.value.ts || 0 });
                            cursor.continue();
                        } else {
                            items.sort((a, b) => a.ts - b.ts);
                            const evictCount = Math.ceil(items.length * 0.2);
                            const toEvict = items.slice(0, evictCount);
                            toEvict.forEach(it => store.delete(it.key));
                        }
                    };
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                };
                allReq.onerror = () => resolve();
            } catch (e) { resolve(); }
        }));
    }

    async function putTileWithEviction(key, blob) {
        try {
            await putTile(key, blob);
        } catch (err) {
            if (err && (err.name === 'QuotaExceededError' || err.name === 'UnknownError')) {
                console.warn('Tile cache quota exceeded — evicting oldest 20% and retrying.');
                await evictOldest20Percent();
                try { await putTile(key, blob); } catch (_) {}
            } else {
                console.warn('Tile cache put failed:', err);
            }
        }
    }

    function tileKey(coords) {
        return `${coords.z}/${coords.x}/${coords.y}`;
    }

    function blobToUrl(blob) {
        if (!blob) return null;
        return URL.createObjectURL(blob);
    }

    L.TileLayer.Offline = L.TileLayer.extend({
        createTile: function (coords, done) {
            const tile = document.createElement('img');
            tile.onerror = () => done(new Error('tile error'), tile);
            tile.onload = () => done(null, tile);

            const key = tileKey(coords);
            getTile(key).then(async (cached) => {
                const now = Date.now();
                if (cached && cached.blob) {
                    // Use cached tile immediately.
                    tile.src = blobToUrl(cached.blob);
                    // Revalidate in background if stale.
                    if (now - (cached.ts || 0) > TILE_TTL_MS) {
                        this._fetchAndCache(coords, key, tile, /*background=*/true);
                    }
                } else {
                    // Not cached — fetch from network.
                    await this._fetchAndCache(coords, key, tile, /*background=*/false);
                }
            }).catch(() => {
                // IndexedDB unavailable — fall back to direct network fetch.
                this._directLoad(tile, coords);
            });

            return tile;
        },

        _directLoad(tile, coords) {
            const url = this.getTileUrl(coords);
            tile.src = url;
        },

        async _fetchAndCache(coords, key, tile, background) {
            const url = this.getTileUrl(coords);
            // If we're offline, don't even try — leave tile blank.
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                if (!tile.src) {
                    // No cached tile and offline — leave blank (transparent).
                    tile.src = this._transparentPixel();
                }
                return;
            }
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (!response.ok) {
                    if (!tile.src) tile.src = this._transparentPixel();
                    return;
                }
                const blob = await response.blob();
                if (blob && blob.size > 0) {
                    await putTileWithEviction(key, blob);
                    // If this is a background revalidation, only swap the tile
                    // if it's still the same coords (user may have moved on).
                    if (!background || tile._leaflet_coords === coords) {
                        tile.src = blobToUrl(blob);
                    }
                } else if (!tile.src) {
                    tile.src = url; // fall back to direct URL
                }
            } catch (err) {
                // Network failure — if we already have a cached tile, it's still showing.
                if (!tile.src) tile.src = this._transparentPixel();
            }
        },

        _transparentPixel() {
            return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }
    });

    L.tileLayer.offline = function (url, options) {
        return new L.TileLayer.Offline(url, options);
    };
})();
