window.dbManager = {
    db: null,
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('GpxViewerDB', 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata');
                }
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files');
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async get(store, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            const transaction = this.db.transaction([store], 'readonly');
            const request = transaction.objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    async set(store, key, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            const transaction = this.db.transaction([store], 'readwrite');
            const request = transaction.objectStore(store).put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    async delete(store, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            const transaction = this.db.transaction([store], 'readwrite');
            const request = transaction.objectStore(store).delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    async getAll(store) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            const transaction = this.db.transaction([store], 'readonly');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.getAll();
            const keysRequest = objectStore.getAllKeys();

            let values = null;
            let keys = null;

            const checkComplete = () => {
                if (values !== null && keys !== null) {
                    const results = {};
                    values.forEach((val, i) => {
                        results[keys[i]] = val;
                    });
                    resolve(results);
                }
            };

            request.onsuccess = () => {
                values = request.result;
                checkComplete();
            };
            keysRequest.onsuccess = () => {
                keys = keysRequest.result;
                checkComplete();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    },
    async migrateFromLocalStorage() {
        const migrated = await this.get('settings', 'migrated');
        if (migrated) return;

        console.log('Migrating data from localStorage to IndexedDB...');

        const transaction = this.db.transaction(['settings', 'metadata', 'files'], 'readwrite');

        // Migrate settings
        const settings = localStorage.getItem('gpxViewerSettings');
        if (settings) {
            transaction.objectStore('settings').put(JSON.parse(settings), 'gpxViewerSettings');
        }

        // Migrate metadata
        const metadata = localStorage.getItem('gpxMetadata');
        if (metadata) {
            const parsedMetadata = JSON.parse(metadata);
            for (const key in parsedMetadata) {
                transaction.objectStore('metadata').put(parsedMetadata[key], key);
            }
        }

        // Migrate files
        const files = localStorage.getItem('gpxFiles');
        if (files) {
            const parsedFiles = JSON.parse(files);
            for (const key in parsedFiles) {
                transaction.objectStore('files').put(parsedFiles[key], key);
            }
        }

        transaction.objectStore('settings').put(true, 'migrated');

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('Migration complete.');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    },
    async saveGpxBulk(tracks) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files', 'metadata'], 'readwrite');
            const fileStore = transaction.objectStore('files');
            const metaStore = transaction.objectStore('metadata');

            tracks.forEach(track => {
                fileStore.put(track.data, track.name);
                if (track.metadata) {
                    metaStore.put(track.metadata, track.name);
                }
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    },
    async clearLibrary() {
        const transaction = this.db.transaction(['files', 'metadata'], 'readwrite');
        transaction.objectStore('files').clear();
        transaction.objectStore('metadata').clear();

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    }
};
