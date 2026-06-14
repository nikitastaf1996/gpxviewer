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

                    tracks.push({
                        name: filename.split('/').pop(), // Use just the filename without path
                        data: gpxData,
                        metadata: metadata
                    });

                    this.importProgress = Math.round(((i + 1) / totalFiles) * 100);
                }

                if (tracks.length > 0) {
                    await window.dbManager.saveGpxBulk(tracks);
                    await Alpine.store('app').loadSavedMetadata();
                    window.geocoder.wakeUp();
                    this.displayGpx({ filename: tracks[0].name, ...tracks[0].metadata });
                }
            } catch (error) {
                console.error('ZIP import failed:', error);
                alert('Failed to import ZIP file.');
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

                await window.dbManager.saveGpxBulk([{ name: file.name, data: gpxData, metadata }]);
                await Alpine.store('app').loadSavedMetadata();
                window.geocoder.wakeUp();
                this.displayGpx({ filename: file.name, ...metadata });
            };
            reader.readAsText(file);
        },

        async deleteGpx(name) {
            await window.dbManager.delete('files', name);
            await window.dbManager.delete('metadata', name);

            if (Alpine.store('app').activeGpx && Alpine.store('app').activeGpx.filename === name) {
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
