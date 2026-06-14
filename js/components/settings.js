document.addEventListener('alpine:init', () => {
    Alpine.data('settings', () => ({
        async clearLibrary() {
            await window.dbManager.clearLibrary();
            await Alpine.store('app').loadSavedMetadata();
            Alpine.store('app').activeGpx = null;
            console.log('Library cleared.');
        }
    }));
});
