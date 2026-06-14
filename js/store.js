document.addEventListener('alpine:init', () => {
    Alpine.store('app', {
        activeTab: 'library',
        savedFiles: [],
        activeGpx: null,
        activeGpxStats: {
            distance: null,
            duration: null,
            pace: null,
            elevationGain: null,
            elevationLoss: null
        },
        visibleCharts: {
            elevation: true,
            pace: true,
            combo: true,
            climb: true,
            splits: true
        },

        showTab(tabId) {
            this.activeTab = tabId;
            if (tabId === 'analyze') {
                // Emit event to notify Analyze component to resize map/charts
                window.dispatchEvent(new CustomEvent('tab-changed', { detail: { tab: tabId } }));
            }
        },

        async loadSettings() {
            const saved = await window.dbManager.get('settings', 'gpxViewerSettings');
            if (saved) {
                this.visibleCharts = saved;
            }
        },

        async saveSettings() {
            await window.dbManager.set('settings', 'gpxViewerSettings', JSON.parse(JSON.stringify(this.visibleCharts)));
            window.dispatchEvent(new CustomEvent('settings-updated'));
        },

        async loadSavedMetadata() {
            const savedMeta = await window.dbManager.getAll('metadata');
            this.savedFiles = Object.keys(savedMeta).map(filename => ({
                filename,
                ...savedMeta[filename]
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    });
});
