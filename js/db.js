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

    /**
     * One-time migration: convert filename-keyed entries to UUID-keyed entries.
     * Each run is stored with `id` (UUID) as the primary key in both `files`
     * and `metadata` stores, with `filename` kept as a property inside the
     * metadata value. Existing entries whose key looks like a filename are
     * rewritten under a fresh UUID and the old key is deleted.
     *
     * Safe to call on every init; the `uuidMigrationDone` flag in the settings
     * store prevents re-running after the first successful pass.
     */
    async migrateToUuidKeys() {
        const done = await this.get('settings', 'uuidMigrationDone');
        if (done) return;

        console.log('Migrating runs from filename keys to UUID keys...');

        const allMeta = await this.getAll('metadata');
        const allFiles = await this.getAll('files');

        // A key is "old-style" (filename) if it does NOT look like a UUID.
        // UUIDs match /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const oldKeys = Object.keys(allMeta).filter(k => !uuidRe.test(k));

        if (oldKeys.length === 0) {
            await this.set('settings', 'uuidMigrationDone', true);
            console.log('UUID migration: nothing to do.');
            return;
        }

        const transaction = this.db.transaction(['files', 'metadata', 'settings'], 'readwrite');
        const fileStore = transaction.objectStore('files');
        const metaStore = transaction.objectStore('metadata');

        for (const oldKey of oldKeys) {
            try {
                const meta = allMeta[oldKey];
                const file = allFiles[oldKey];
                const newId = (crypto && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                        const r = Math.random() * 16 | 0;
                        const v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });

                if (meta) {
                    // Stamp id and filename onto the metadata value so callers
                    // can find both. The `filename` field is the original name.
                    meta.id = newId;
                    if (!meta.filename) meta.filename = oldKey;
                    metaStore.put(meta, newId);
                    metaStore.delete(oldKey);
                }
                if (file !== undefined) {
                    fileStore.put(file, newId);
                    fileStore.delete(oldKey);
                }
            } catch (err) {
                // One corrupt record should not block the rest.
                console.error('UUID migration: failed for', oldKey, err);
            }
        }

        transaction.objectStore('settings').put(true, 'uuidMigrationDone');

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log(`UUID migration: ${oldKeys.length} run(s) migrated.`);
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    },

    /**
     * Save a batch of tracks. Each track must have:
     *   - id: UUID (primary key)
     *   - data: raw GPX XML string (stored in `files`)
     *   - metadata: object including `id` and `filename` (stored in `metadata`)
     * Multiple tracks with the same filename are allowed because the key is
     * the UUID, which is unique by construction.
     */
    async saveGpxBulk(tracks) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files', 'metadata'], 'readwrite');
            const fileStore = transaction.objectStore('files');
            const metaStore = transaction.objectStore('metadata');

            tracks.forEach(track => {
                const id = track.id;
                if (!id) {
                    console.error('saveGpxBulk: track missing id, skipping', track);
                    return;
                }
                fileStore.put(track.data, id);
                if (track.metadata) {
                    // Ensure the metadata record carries its own id so callers
                    // can read it back without inspecting the key.
                    track.metadata.id = id;
                    metaStore.put(track.metadata, id);
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
