document.addEventListener('alpine:init', async () => {
    try {
        await window.dbManager.init();
        await window.dbManager.migrateFromLocalStorage();
        await window.dbManager.migrateToUuidKeys();

        const appStore = Alpine.store('app');
        appStore.initOnlineListeners && appStore.initOnlineListeners();
        await appStore.loadSettings();
        await appStore.loadSavedMetadata();

        // Start background geocoder
        window.geocoder.start();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed:', err));
        }
    } catch (error) {
        console.error('Initialization failed:', error);
    }
});
