document.addEventListener('alpine:init', () => {
    Alpine.data('analyze', () => ({
        map: null,
        currentTrack: null,
        charts: {},
        isInitialized: false,

        init() {
            // Prevent multiple initializations if Alpine re-renders
            if (this.isInitialized) return;
            this.isInitialized = true;

            this.map = L.map('map', {
                fullscreenControl: true
            }).setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.map);

            window.map = this.map;

            window.addEventListener('tab-changed', (e) => {
                if (e.detail.tab === 'analyze') {
                    setTimeout(() => {
                        this.map.invalidateSize();
                        Object.values(this.charts).forEach(chart => chart.resize());
                    }, 100);
                }
            });

            window.addEventListener('settings-updated', () => {
                setTimeout(() => {
                    Object.values(this.charts).forEach(chart => chart.resize());

                    // Recalculate calories for active run if weight changed
                    if (Alpine.store('app').activeGpxStats.distance) {
                        const distKm = parseFloat(Alpine.store('app').activeGpxStats.distance);
                        const weight = Alpine.store('app').userWeight || 70;
                        Alpine.store('app').activeGpxStats.calories = Math.round(distKm * weight * 1.036);
                    }
                }, 0);
            });

            window.addEventListener('display-gpx', async (e) => {
                await this.displayGpx(e.detail.metadata);
            });
        },

        async displayGpx(metadata) {
            const gpxData = await window.dbManager.get('files', metadata.filename);
            if (!gpxData) return;

            if (this.currentTrack) {
                this.map.removeLayer(this.currentTrack);
            }

            Alpine.store('app').activeGpxStats.location = metadata.city || '-';
            Alpine.store('app').activeGpxStats.customName = metadata.customName || '';

            this.currentTrack = new L.GPX(gpxData, {
                async: true,
                marker_options: {
                    startIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
                    endIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
                    shadowUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png'
                }
            }).on('loaded', (e) => {
                const gpx = e.target;
                this.map.invalidateSize();
                this.map.fitBounds(gpx.getBounds());

                const distKm = gpx.get_distance() / 1000;
                const weight = Alpine.store('app').userWeight || 70;
                Alpine.store('app').activeGpxStats.distance = distKm.toFixed(2) + " km";
                Alpine.store('app').activeGpxStats.duration = window.gpxUtils.formatDuration(gpx.get_total_time());
                Alpine.store('app').activeGpxStats.startTime = new Date(metadata.date).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                Alpine.store('app').activeGpxStats.calories = Math.round(distKm * weight * 1.036);

                if (distKm > 0) {
                    const paceMinPerKm = (gpx.get_total_time() / 1000 / 60) / distKm;
                    Alpine.store('app').activeGpxStats.pace = window.gpxUtils.formatPace(paceMinPerKm);
                } else {
                    Alpine.store('app').activeGpxStats.pace = "-";
                }

                Alpine.store('app').activeGpxStats.elevationGain = gpx.get_elevation_gain().toFixed(0) + " m";
                Alpine.store('app').activeGpxStats.elevationLoss = gpx.get_elevation_loss().toFixed(0) + " m";

                const points = window.gpxUtils.processGpxPoints(gpxData);
                const processedData = window.gpxUtils.calculateMetrics(points);
                this.generateCharts(processedData, points);
            }).addTo(this.map);
        },

        async updateRunName(newName) {
            const activeGpx = Alpine.store('app').activeGpx;
            if (!activeGpx) return;

            const metadata = await window.dbManager.get('metadata', activeGpx.filename);
            if (metadata) {
                metadata.customName = newName;
                await window.dbManager.set('metadata', activeGpx.filename, metadata);
                activeGpx.customName = newName;
                Alpine.store('app').activeGpxStats.customName = newName;
                await Alpine.store('app').loadSavedMetadata();
            }
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
            const canvas = document.getElementById('elevation-chart');
            if (!canvas) {
                console.error('Elevation chart canvas not found!');
                return;
            }
            const ctx = canvas.getContext('2d');
            const eleData = data.map(d => d.ele);
            const minEle = Math.min(...eleData);
            const maxEle = Math.max(...eleData);

            this.charts.elevation = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Elevation (m)',
                        data: data.map(d => ({x: d.dist, y: d.ele})),
                        borderColor: '#0062ff',
                        backgroundColor: 'rgba(0, 98, 255, 0.1)',
                        fill: true,
                        pointRadius: data.map(d => (d.ele === minEle || d.ele === maxEle) ? 4 : 0),
                        pointBackgroundColor: data.map(d => d.ele === maxEle ? '#ff6b6b' : (d.ele === minEle ? '#4dabf7' : 'transparent')),
                        borderWidth: 2,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: "linear", title: { display: false } },
                        y: { title: { display: true, text: 'Elevation (m)' } }
                    },
                    plugins: {
                        title: { display: true, text: 'Elevation Profile', align: 'start', font: { size: 14, weight: 'bold' } },
                        legend: { display: false }
                    }
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
                            label: 'Pace',
                            data: data.map(d => ({x: d.dist, y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null})),
                            borderColor: '#ff6b6b',
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            pointRadius: 0,
                            tension: 0.4
                        },
                        {
                            label: 'GAP',
                            data: data.map(d => ({x: d.dist, y: d.smoothedGap > 0 && d.smoothedGap < 20 ? d.smoothedGap : null})),
                            borderColor: '#fab005',
                            backgroundColor: 'transparent',
                            borderDash: [4, 4],
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: "linear", title: { display: false } },
                        y: { reverse: true, title: { display: true, text: 'Pace (min/km)' }, suggestedMin: 3, suggestedMax: 10 }
                    },
                    plugins: {
                        title: { display: true, text: 'Pace & Grade Adjusted Pace', align: 'start', font: { size: 14, weight: 'bold' } },
                        legend: { position: 'top', align: 'end', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle' } }
                    }
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
                            label: 'Elevation',
                            data: data.map(d => ({x: d.dist, y: d.ele})),
                            borderColor: '#0062ff',
                            yAxisID: 'y-ele',
                            fill: false,
                            pointRadius: 0,
                            borderWidth: 2
                        },
                        {
                            label: 'Pace',
                            data: data.map(d => ({x: d.dist, y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null})),
                            borderColor: '#ff6b6b',
                            yAxisID: 'y-pace',
                            fill: false,
                            pointRadius: 0,
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: "linear", title: { display: false } },
                        'y-ele': { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Elevation (m)' } },
                        'y-pace': { type: 'linear', display: true, position: 'right', reverse: true, title: { display: true, text: 'Pace (min/km)' }, grid: { drawOnChartArea: false }, suggestedMin: 3, suggestedMax: 10 }
                    },
                    plugins: {
                        title: { display: true, text: 'Elevation & Pace', align: 'start', font: { size: 14, weight: 'bold' } },
                        legend: { position: 'top', align: 'end', labels: { boxWidth: 12 } }
                    }
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
                    labels: climbs.map((_, i) => "Climb " + (i + 1)),
                    datasets: [{ label: 'Avg Pace', data: climbs.map(c => c.avgPace), backgroundColor: 'rgba(130, 201, 30, 0.7)', borderRadius: 6 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Hill Consistency Matrix', align: 'start', font: { size: 14, weight: 'bold' } },
                        legend: { display: false }
                    },
                    scales: {
                        y: { reverse: true, title: { display: true, text: 'Avg Pace (min/km)' } },
                        x: { grid: { display: false } }
                    }
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
                    if (dDist > 0.1) splits.push({ label: (splits.length + 1), pace: dTime / dDist });
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
                    datasets: [{ label: 'Split Pace', data: splits.map(s => s.pace), backgroundColor: splits.map(s => s.pace <= avgPace ? 'rgba(51, 209, 122, 0.7)' : 'rgba(255, 107, 107, 0.7)'), borderRadius: 6 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Split Performance (1km)', align: 'start', font: { size: 14, weight: 'bold' } },
                        legend: { display: false }
                    },
                    scales: {
                        y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } },
                        x: { title: { display: true, text: 'Kilometer' }, grid: { display: false } }
                    }
                }
            });
        }
    }));
});
