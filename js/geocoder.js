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
                const allMetadata = await window.dbManager.getAll('metadata');
                const pendingEntries = Object.entries(allMetadata)
                    .filter(([name, meta]) => meta.city === undefined || meta.city === null)
                    .map(([name, meta]) => ({ name, ...meta }));

                if (pendingEntries.length === 0) {
                    // Nothing to do, wait 60 seconds before checking again, or until woken up
                    await this.sleep(60000);
                    continue;
                }

                for (const item of pendingEntries) {
                    if (!this.isProcessing) break;

                    // Double check if it still needs geocoding (another tab might have finished it)
                    const currentMeta = await window.dbManager.get('metadata', item.name);
                    if (!currentMeta || (currentMeta.city !== undefined && currentMeta.city !== null)) {
                        continue;
                    }

                    console.log(`Geocoding ${item.name}...`);
                    const cityName = await window.gpxUtils.fetchCityName(item.lat, item.lon);

                    // Update record
                    currentMeta.city = cityName || '';
                    await window.dbManager.set('metadata', item.name, currentMeta);

                    // Refresh Alpine store if available
                    if (window.Alpine && Alpine.store('app')) {
                        Alpine.store('app').updateCityMetadata(item.name, currentMeta.city);
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
