document.addEventListener('alpine:init', () => {
    Alpine.data('settings', () => ({
        async clearLibrary() {
            await window.dbManager.clearLibrary();
            await Alpine.store('app').loadSavedMetadata();
            Alpine.store('app').activeGpx = null;
            console.log('Library cleared.');
        },

        async syncGeocoding() {
            Alpine.store('app').confirm({
                title: 'Sync Geocoding',
                message: 'This will re-process the location for all your runs. It might take a while depending on the number of runs. Continue?',
                onConfirm: async () => {
                    try {
                        const allMetadata = await window.dbManager.getAll('metadata');
                        const ids = Object.keys(allMetadata);

                        for (const id of ids) {
                            const meta = allMetadata[id];
                            meta.city = null; // Mark as pending
                            await window.dbManager.set('metadata', id, meta);
                        }

                        // Refresh the store so UI shows pending state
                        await Alpine.store('app').loadSavedMetadata();

                        // Wake up geocoder
                        window.geocoder.wakeUp();

                        console.log('Geocoding sync started.');
                        Alpine.store('app').toast('Geocoding sync started.');
                    } catch (error) {
                        console.error('Failed to sync geocoding:', error);
                        Alpine.store('app').toast('Failed to start sync.');
                    }
                }
            });
        }
    }));
});
