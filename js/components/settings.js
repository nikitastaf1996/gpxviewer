document.addEventListener('alpine:init', () => {
    Alpine.data('settings', () => ({
        async clearLibrary() {
            await window.dbManager.clearLibrary();
            Alpine.store('app').savedFiles = [];
            Alpine.store('app').activeGpx = null;
            console.log('Library cleared.');
        }
    }));
});
