document.addEventListener('alpine:init', () => {
    Alpine.data('settings', () => ({
        async clearLibrary() {
            await window.dbManager.clearLibrary();
            await Alpine.store('app').loadSavedMetadata();
            Alpine.store('app').activeGpx = null;
            console.log('Library cleared.');
        },

        async syncGeocoding() {
            if (!confirm('This will re-process the location for all your runs. It might take a while depending on the number of runs. Continue?')) {
                return;
            }

            try {
                const allMetadata = await window.dbManager.getAll('metadata');
                const filenames = Object.keys(allMetadata);

                for (const filename of filenames) {
                    const meta = allMetadata[filename];
                    meta.city = null; // Mark as pending
                    await window.dbManager.set('metadata', filename, meta);
                }

                // Refresh the store so UI shows pending state
                await Alpine.store('app').loadSavedMetadata();

                // Wake up geocoder
                window.geocoder.wakeUp();

                console.log('Geocoding sync started.');
            } catch (error) {
                console.error('Failed to sync geocoding:', error);
                alert('Failed to start sync. See console for details.');
            }
        }
    }));
});
