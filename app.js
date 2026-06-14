function app() {
    return {
        activeTab: 'library',
        savedFiles: [],
        isImporting: false,
        importProgress: 0,
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
        map: null,
        currentTrack: null,
        charts: {},
        db: null,

        async initDb() {
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

        async dbGet(store, key) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([store], 'readonly');
                const request = transaction.objectStore(store).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async dbSet(store, key, value) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([store], 'readwrite');
                const request = transaction.objectStore(store).put(value, key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async dbDelete(store, key) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([store], 'readwrite');
                const request = transaction.objectStore(store).delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async dbGetAll(store) {
            return new Promise((resolve, reject) => {
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
            const migrated = await this.dbGet('settings', 'migrated');
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

        async init() {
            try {
                this.map = L.map('map', {
                    fullscreenControl: true
                }).setView([0, 0], 2);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(this.map);

                // Make map globally accessible for plugins if needed
                window.map = this.map;

                await this.initDb();
                await this.migrateFromLocalStorage();
                await this.loadSettings();
                await this.loadSavedMetadata();

                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed:', err));
                }
            } catch (error) {
                console.error('Initialization failed:', error);
            }
        },

        showTab(tabId) {
            this.activeTab = tabId;
            if (tabId === 'analyze') {
                setTimeout(() => {
                    this.map.invalidateSize();
                    Object.values(this.charts).forEach(chart => chart.resize());
                }, 100);
            }
        },

        async loadSettings() {
            const saved = await this.dbGet('settings', 'gpxViewerSettings');
            if (saved) {
                this.visibleCharts = saved;
            }
        },

        async saveSettings() {
            await this.dbSet('settings', 'gpxViewerSettings', JSON.parse(JSON.stringify(this.visibleCharts)));
            setTimeout(() => {
                Object.values(this.charts).forEach(chart => chart.resize());
            }, 0);
        },

        async loadSavedMetadata() {
            const savedMeta = await this.dbGetAll('metadata');
            this.savedFiles = Object.keys(savedMeta).map(filename => ({
                filename,
                ...savedMeta[filename]
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
        },

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
                    const metadata = this.parseGpxMetadata(gpxData);
                    if (metadata) {
                        metadata.city = await this.fetchCityName(metadata.lat, metadata.lon);
                    }
                    tracks.push({
                        name: filename.split('/').pop(), // Use just the filename without path
                        data: gpxData,
                        metadata: metadata
                    });

                    this.importProgress = Math.round(((i + 1) / totalFiles) * 100);
                }

                if (tracks.length > 0) {
                    await this.saveGpxBulk(tracks);
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
                const metadata = this.parseGpxMetadata(gpxData);
                if (metadata) {
                    metadata.city = await this.fetchCityName(metadata.lat, metadata.lon);
                }
                await this.saveGpx(file.name, gpxData, metadata);
                this.displayGpx({ filename: file.name, ...metadata });
            };
            reader.readAsText(file);
        },

        async saveGpx(name, data, metadata) {
            await this.saveGpxBulk([{ name, data, metadata }]);
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

                transaction.oncomplete = async () => {
                    await this.loadSavedMetadata();
                    resolve();
                };
                transaction.onerror = (e) => reject(e.target.error);
            });
        },

        async deleteGpx(name) {
            await this.dbDelete('files', name);
            await this.dbDelete('metadata', name);

            if (this.activeGpx && this.activeGpx.filename === name) {
                this.activeGpx = null;
            }
            await this.loadSavedMetadata();
        },

        async clearLibrary() {
            const transaction = this.db.transaction(['files', 'metadata'], 'readwrite');
            transaction.objectStore('files').clear();
            transaction.objectStore('metadata').clear();

            return new Promise((resolve, reject) => {
                transaction.oncomplete = async () => {
                    this.savedFiles = [];
                    this.activeGpx = null;
                    console.log('Library cleared.');
                    resolve();
                };
                transaction.onerror = (e) => reject(e.target.error);
            });
        },

        async displayGpx(metadata) {
            this.activeGpx = metadata;
            this.showTab('analyze');

            const gpxData = await this.dbGet('files', metadata.filename);

            if (!gpxData) return;

            if (this.currentTrack) {
                this.map.removeLayer(this.currentTrack);
            }

            this.currentTrack = new L.GPX(gpxData, {
                async: true,
                marker_options: {
                    startIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
                    endIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
                    shadowUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png'
                }
            }).on('loaded', (e) => {
                const gpx = e.target;
                this.map.fitBounds(gpx.getBounds());

                const distKm = gpx.get_distance() / 1000;
                this.activeGpxStats.distance = distKm.toFixed(2) + " km";
                this.activeGpxStats.duration = this.formatDuration(gpx.get_total_time());

                if (distKm > 0) {
                    const paceMinPerKm = (gpx.get_total_time() / 1000 / 60) / distKm;
                    this.activeGpxStats.pace = this.formatPace(paceMinPerKm);
                } else {
                    this.activeGpxStats.pace = "-";
                }

                this.activeGpxStats.elevationGain = gpx.get_elevation_gain().toFixed(0) + " m";
                this.activeGpxStats.elevationLoss = gpx.get_elevation_loss().toFixed(0) + " m";

                this.processGpxData(gpxData);
            }).addTo(this.map);
        },

        parseGpxMetadata(gpxXml) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxXml, "text/xml");
            const trkpts = xmlDoc.getElementsByTagName("trkpt");

            if (trkpts.length === 0) return null;

            const firstPt = trkpts[0];
            const lastPt = trkpts[trkpts.length - 1];

            const startTime = firstPt.getElementsByTagName("time")[0] ? new Date(firstPt.getElementsByTagName("time")[0].textContent) : new Date();
            const endTime = lastPt.getElementsByTagName("time")[0] ? new Date(lastPt.getElementsByTagName("time")[0].textContent) : startTime;

            let totalDist = 0;
            for (let i = 1; i < trkpts.length; i++) {
                const p1 = trkpts[i-1];
                const p2 = trkpts[i];
                totalDist += this.calculateDistance(
                    parseFloat(p1.getAttribute("lat")), parseFloat(p1.getAttribute("lon")),
                    parseFloat(p2.getAttribute("lat")), parseFloat(p2.getAttribute("lon"))
                );
            }

            const distKm = totalDist / 1000;
            const durationMs = endTime - startTime;
            const paceMinPerKm = distKm > 0 ? (durationMs / 1000 / 60) / distKm : 0;

            return {
                date: startTime,
                distance: distKm,
                avgPace: paceMinPerKm,
                lat: parseFloat(firstPt.getAttribute("lat")),
                lon: parseFloat(firstPt.getAttribute("lon"))
            };
        },

        async fetchCityName(lat, lon) {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
                if (!response.ok) throw new Error('Network response was not ok');
                const data = await response.json();
                const address = data.address;
                return address.city || address.town || address.village || address.suburb || address.county || '';
            } catch (error) {
                console.error('Reverse geocoding failed:', error);
                return '';
            }
        },

        processGpxData(gpxXml) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxXml, "text/xml");
            const trkpts = xmlDoc.getElementsByTagName("trkpt");

            const points = [];
            let totalDist = 0;

            for (let i = 0; i < trkpts.length; i++) {
                const pt = trkpts[i];
                const lat = parseFloat(pt.getAttribute("lat"));
                const lon = parseFloat(pt.getAttribute("lon"));
                const ele = pt.getElementsByTagName("ele")[0] ? parseFloat(pt.getElementsByTagName("ele")[0].textContent) : null;
                const time = pt.getElementsByTagName("time")[0] ? new Date(pt.getElementsByTagName("time")[0].textContent) : null;

                let hdop = pt.getElementsByTagName("hdop")[0] ? parseFloat(pt.getElementsByTagName("hdop")[0].textContent) : null;
                if (!hdop) {
                    const extensions = pt.getElementsByTagName("extensions")[0];
                    if (extensions) {
                        hdop = extensions.getElementsByTagName("hdop")[0] ? parseFloat(extensions.getElementsByTagName("hdop")[0].textContent) : null;
                    }
                }

                if (i > 0) {
                    const prevPt = points[i-1];
                    totalDist += this.calculateDistance(prevPt.lat, prevPt.lon, lat, lon);
                }

                points.push({ lat, lon, ele, time, dist: totalDist, hdop });
            }

            const processedData = this.calculateMetrics(points);
            this.generateCharts(processedData, points);
        },

        calculateMetrics(points) {
            const windowSize = 10;
            const metrics = [];

            for (let i = 0; i < points.length; i++) {
                let pace = 0;
                let gap = 0;

                if (i > 0) {
                    const dt = (points[i].time - points[i-1].time) / 1000;
                    const dd = points[i].dist - points[i-1].dist;

                    if (dt > 0 && dd > 0) {
                        pace = (dt / 60) / (dd / 1000);
                        const grade = (points[i].ele - points[i-1].ele) / dd;
                        const c = grade;
                        const ratio = 1 + 9*c*c + (c > 0 ? 3*c : 2*c);
                        gap = pace / ratio;
                    }
                }

                metrics.push({
                    dist: points[i].dist / 1000,
                    ele: points[i].ele,
                    pace: pace,
                    gap: gap,
                    hdop: points[i].hdop
                });
            }

            for (let i = 0; i < metrics.length; i++) {
                const start = Math.max(0, i - Math.floor(windowSize / 2));
                const end = Math.min(metrics.length - 1, i + Math.floor(windowSize / 2));
                let sumPace = 0, sumGap = 0, count = 0;
                for (let j = start; j <= end; j++) {
                    if (metrics[j].pace > 0) {
                        sumPace += metrics[j].pace;
                        sumGap += metrics[j].gap;
                        count++;
                    }
                }
                metrics[i].smoothedPace = count > 0 ? sumPace / count : 0;
                metrics[i].smoothedGap = count > 0 ? sumGap / count : 0;
            }

            return metrics;
        },

        generateCharts(data, points) {
            this.createElevationChart(data);
            this.createPaceChart(data);
            this.createComboChart(data);
            this.createClimbChart(data);
            this.createSplitsChart(data, points);
        },

        createElevationChart(data) {
            if (this.charts.elevation) this.charts.elevation.destroy();
            const ctx = document.getElementById('elevation-chart').getContext('2d');
            const eleData = data.map(d => d.ele);
            const minEle = Math.min(...eleData);
            const maxEle = Math.max(...eleData);

            this.charts.elevation = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Elevation (m)',
                        data: data.map(d => ({x: d.dist, y: d.ele})),
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        fill: true,
                        pointRadius: data.map(d => (d.ele === minEle || d.ele === maxEle) ? 5 : 0),
                        pointBackgroundColor: data.map(d => d.ele === maxEle ? 'red' : (d.ele === minEle ? 'blue' : 'transparent')),
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: "linear", title: { display: true, text: 'Distance (km)' } },
                        y: { title: { display: true, text: 'Elevation (m)' } }
                    },
                    plugins: { title: { display: true, text: 'Elevation Profile' } }
                }
            });
        },

        createPaceChart(data) {
            if (this.charts.pace) this.charts.pace.destroy();
            const ctx = document.getElementById('pace-chart').getContext('2d');
            this.charts.pace = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [
                        {
                            label: 'Pace (min/km)',
                            data: data.map(d => ({x: d.dist, y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null})),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.3
                        },
                        {
                            label: 'GAP (min/km)',
                            data: data.map(d => ({x: d.dist, y: d.smoothedGap > 0 && d.smoothedGap < 20 ? d.smoothedGap : null})),
                            borderColor: 'rgba(255, 159, 64, 0.5)',
                            backgroundColor: 'transparent',
                            borderDash: [5, 5],
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: "linear", title: { display: true, text: 'Distance (km)' } },
                        y: { reverse: true, title: { display: true, text: 'Pace (min/km)' }, suggestedMin: 3, suggestedMax: 10 }
                    },
                    plugins: { title: { display: true, text: 'Pace & Grade Adjusted Pace' } }
                }
            });
        },

        createComboChart(data) {
            if (this.charts.combo) this.charts.combo.destroy();
            const ctx = document.getElementById('combo-chart').getContext('2d');
            this.charts.combo = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [
                        {
                            label: 'Elevation (m)',
                            data: data.map(d => ({x: d.dist, y: d.ele})),
                            borderColor: 'rgb(75, 192, 192)',
                            yAxisID: 'y-ele',
                            fill: false,
                            pointRadius: 0
                        },
                        {
                            label: 'Pace (min/km)',
                            data: data.map(d => ({x: d.dist, y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null})),
                            borderColor: 'rgb(255, 99, 132)',
                            yAxisID: 'y-pace',
                            fill: false,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: "linear", title: { display: true, text: 'Distance (km)' } },
                        'y-ele': { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Elevation (m)' } },
                        'y-pace': { type: 'linear', display: true, position: 'right', reverse: true, title: { display: true, text: 'Pace (min/km)' }, grid: { drawOnChartArea: false }, suggestedMin: 3, suggestedMax: 10 }
                    },
                    plugins: { title: { display: true, text: 'Elevation & Pace (Synchronized)' } }
                }
            });
        },

        createClimbChart(data) {
            if (this.charts.climb) this.charts.climb.destroy();
            const climbs = [];
            let currentClimb = null;
            const minGain = 5, minDistance = 100;

            for (let i = 1; i < data.length; i++) {
                const eleDiff = data[i].ele - data[i-1].ele;
                const distDiff = (data[i].dist - data[i-1].dist) * 1000;

                if (eleDiff > 0) {
                    if (!currentClimb) currentClimb = { startIdx: i-1, gain: 0, dist: 0, paces: [] };
                    currentClimb.gain += eleDiff;
                    currentClimb.dist += distDiff;
                    if (data[i].smoothedPace > 0) currentClimb.paces.push(data[i].smoothedPace);
                } else if (currentClimb) {
                    if (currentClimb.gain >= minGain && currentClimb.dist >= minDistance) {
                        currentClimb.avgPace = currentClimb.paces.reduce((a, b) => a + b, 0) / currentClimb.paces.length;
                        climbs.push(currentClimb);
                    }
                    currentClimb = null;
                }
            }

            const ctx = document.getElementById('climb-chart').getContext('2d');
            this.charts.climb = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: climbs.map((_, i) => "Climb #" + (i + 1)),
                    datasets: [{ label: 'Avg Pace on Climb (min/km)', data: climbs.map(c => c.avgPace), backgroundColor: 'rgba(153, 102, 255, 0.6)' }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: true, text: 'Hill Consistency Matrix' } },
                    scales: { y: { reverse: true, title: { display: true, text: 'Avg Pace (min/km)' } } }
                }
            });
        },

        createSplitsChart(data, points) {
            if (this.charts.splits) this.charts.splits.destroy();
            const splits = [];
            const splitDist = 1.0;
            let nextSplit = splitDist, splitStartDist = 0, splitStartTime = points[0].time;

            for (let i = 0; i < data.length; i++) {
                if (data[i].dist >= nextSplit || i === data.length - 1) {
                    const dDist = data[i].dist - splitStartDist;
                    const dTime = (points[i].time - splitStartTime) / 1000 / 60;
                    if (dDist > 0.1) splits.push({ label: "Split " + (splits.length + 1), pace: dTime / dDist });
                    splitStartDist = data[i].dist;
                    splitStartTime = points[i].time;
                    nextSplit += splitDist;
                }
            }
            if (splits.length === 0) return;

            const avgPace = splits.reduce((a, b) => a + b.pace, 0) / splits.length;
            const ctx = document.getElementById('splits-chart').getContext('2d');
            this.charts.splits = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: splits.map(s => s.label),
                    datasets: [{ label: 'Split Pace (min/km)', data: splits.map(s => s.pace), backgroundColor: splits.map(s => s.pace <= avgPace ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)') }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: true, text: 'Split Performance (1km)' } },
                    scales: { y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } } }
                }
            });
        },

        calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371e3;
            const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
            const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        },

        formatDuration(ms) {
            let s = Math.floor(ms / 1000);
            const h = Math.floor(s / 3600);
            s %= 3600;
            const m = Math.floor(s / 60);
            s %= 60;
            return (h > 0 ? h + "h " : "") + m + "m " + s + "s";
        },

        formatPace(minPerKm) {
            let min = Math.floor(minPerKm);
            let sec = Math.round((minPerKm - min) * 60);
            if (sec === 60) { min++; sec = 0; }
            return min + ":" + (sec < 10 ? "0" : "") + sec + " /km";
        },

        formatRunCard(meta) {
            const date = new Date(meta.date);
            const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const cityStr = meta.city ? ' - ' + meta.city : '';
            return `${dateStr}${cityStr} - ${meta.distance.toFixed(2)} km - ${this.formatPace(meta.avgPace)}`;
        }
    };
}
