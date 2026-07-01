/**
 * Background Geocoder
 * Handles reverse geocoding of GPX tracks in the background to avoid blocking the UI
 * and to respect rate limits of geocoding APIs.
 */
window.geocoder = {
    isProcessing: false,
    intervalDelay: 2000, // 2 seconds between requests to be safe (Nominatim allows 1 req/s)
    wakeUpSignal: null,

    async start() {
        if (this.isProcessing) {
            this.wakeUp();
            return;
        }
        this.isProcessing = true;
        console.log('Background geocoder started');
        // Wake the loop immediately when connectivity returns after an
        // offline period — no need to wait for the 30s sleep to elapse.
        if (typeof window !== 'undefined' && !this._onlineBound) {
            window.addEventListener('online', () => this.wakeUp());
            this._onlineBound = true;
        }
        this.processLoop();
    },

    stop() {
        this.isProcessing = false;
        this.wakeUp();
        console.log('Background geocoder stopped');
    },

    wakeUp() {
        if (this.wakeUpSignal) {
            this.wakeUpSignal();
            this.wakeUpSignal = null;
        }
    },

    async processLoop() {
        while (this.isProcessing) {
            try {
                // Skip the whole loop while offline — no point hammering
                // a network that's down. Wake up when connectivity returns
                // (see start() wiring an 'online' listener below).
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    await this.sleep(30000);
                    continue;
                }

                const allMetadata = await window.dbManager.getAll('metadata');
                const pendingEntries = Object.entries(allMetadata)
                    .filter(([id, meta]) => meta.city === undefined || meta.city === null)
                    .map(([id, meta]) => ({ id, ...meta }));

                if (pendingEntries.length === 0) {
                    // Nothing to do, wait 60 seconds before checking again, or until woken up
                    await this.sleep(60000);
                    continue;
                }

                for (const item of pendingEntries) {
                    if (!this.isProcessing) break;

                    // Double check if it still needs geocoding (another tab might have finished it)
                    const currentMeta = await window.dbManager.get('metadata', item.id);
                    if (!currentMeta || (currentMeta.city !== undefined && currentMeta.city !== null)) {
                        continue;
                    }

                    // If we lost connectivity mid-loop, pause and resume later.
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                        await this.sleep(30000);
                        break;
                    }

                    console.log(`Geocoding ${item.filename || item.id}...`);
                    const preferredEntity = window.Alpine && Alpine.store('app') ? Alpine.store('app').geocodingEntity : 'city';
                    const cityName = await window.gpxUtils.fetchCityName(item.lat, item.lon, preferredEntity);

                    // Update record
                    currentMeta.city = cityName || '';
                    await window.dbManager.set('metadata', item.id, currentMeta);

                    // Refresh Alpine store if available
                    if (window.Alpine && Alpine.store('app')) {
                        Alpine.store('app').updateCityMetadata(item.id, currentMeta.city);
                    }

                    // Respect rate limits
                    await this.sleep(this.intervalDelay);
                }
            } catch (error) {
                console.error('Geocoder error in loop:', error);
                await this.sleep(10000); // Wait 10s on error
            }
        }
    },

    sleep(ms) {
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                this.wakeUpSignal = null;
                resolve();
            }, ms);
            this.wakeUpSignal = () => {
                clearTimeout(timeout);
                resolve();
            };
        });
    }
};
