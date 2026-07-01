document.addEventListener('alpine:init', () => {
    Alpine.data('library', () => ({
        isImporting: false,
        importProgress: 0,

        async handleZipFileUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            await this.handleZipUpload(file);
        },

        async handleZipUpload(file) {
            this.isImporting = true;
            this.importProgress = 0;

            try {
                const zip = await JSZip.loadAsync(file);
                const tracks = [];

                const gpxFiles = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.gpx') && !zip.files[name].dir);
                const totalFiles = gpxFiles.length;

                for (let i = 0; i < totalFiles; i++) {
                    const filename = gpxFiles[i];
                    const gpxData = await zip.files[filename].async('string');
                    const metadata = window.gpxUtils.parseGpxMetadata(gpxData);
                    if (!metadata) {
                        // Skip non-GPX / empty / unparseable entries instead of
                        // leaving orphan file blobs in IndexedDB.
                        console.warn('Skipping unparseable GPX entry:', filename);
                        this.importProgress = Math.round(((i + 1) / totalFiles) * 100);
                        continue;
                    }
                    const baseName = filename.split('/').pop();
                    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : generateUuidFallback();
                    metadata.filename = baseName;
                    metadata.id = id;

                    tracks.push({
                        id,
                        name: baseName,
                        data: gpxData,
                        metadata: metadata
                    });

                    this.importProgress = Math.round(((i + 1) / totalFiles) * 100);
                }

                if (tracks.length > 0) {
                    await window.dbManager.saveGpxBulk(tracks);
                    await Alpine.store('app').loadSavedMetadata();
                    window.geocoder.wakeUp();
                    this.displayGpx({ id: tracks[0].id, ...tracks[0].metadata });
                } else {
                    Alpine.store('app').toast('No valid GPX files found in ZIP.');
                }
            } catch (error) {
                console.error('ZIP import failed:', error);
                Alpine.store('app').toast('Failed to import ZIP file.');
            } finally {
                setTimeout(() => {
                    this.isImporting = false;
                    this.importProgress = 0;
                }, 500); // Keep progress bar visible for a moment
            }
        },

        async handleFileUpload(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                const gpxData = e.target.result;
                const metadata = window.gpxUtils.parseGpxMetadata(gpxData);
                if (!metadata) {
                    Alpine.store('app').toast('Could not parse GPX file.');
                    return;
                }
                const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : generateUuidFallback();
                metadata.filename = file.name;
                metadata.id = id;

                await window.dbManager.saveGpxBulk([{ id, name: file.name, data: gpxData, metadata }]);
                await Alpine.store('app').loadSavedMetadata();
                window.geocoder.wakeUp();
                this.displayGpx({ id, ...metadata });
            };
            reader.readAsText(file);
        },

        async deleteGpx(id) {
            await window.dbManager.delete('files', id);
            await window.dbManager.delete('metadata', id);

            if (Alpine.store('app').activeGpx && Alpine.store('app').activeGpx.id === id) {
                Alpine.store('app').activeGpx = null;
            }
            await Alpine.store('app').loadSavedMetadata();
        },

        displayGpx(metadata) {
            Alpine.store('app').activeGpx = metadata;
            Alpine.store('app').showTab('analyze');
            window.dispatchEvent(new CustomEvent('display-gpx', { detail: { metadata } }));
        },

        formatRunCard(meta) {
            const date = new Date(meta.date);
            const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const cityStr = meta.city ? ' - ' + meta.city : '';
            return `${dateStr}${cityStr} - ${meta.distance.toFixed(2)} km - ${window.gpxUtils.formatPace(meta.avgPace)}`;
        }
    }));
});

// RFC4122 v4 fallback for environments without crypto.randomUUID.
function generateUuidFallback() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
