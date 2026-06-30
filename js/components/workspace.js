document.addEventListener('alpine:init', () => {
    Alpine.data('workspace', () => ({
        map: null,
        mainChart: null,
        sliderChart: null,
        marker: null,
        polyline: null,
        hoverStats: {
            distance: '0.00 km',
            pace: '0:00',
            grade: '0%',
            elevation: '0 m'
        },

        isInitialized: false,
        lastPanTime: 0,
        resizeObserver: null,
        isDragging: false,
        dragType: null, // 'pan', 'start', 'end'

        init() {
            // Alpine calls this on load, but we want to init only when workspace is opened
            // The x-effect calls init() manually.
            if (!Alpine.store('app').isFullscreenAnalysisActive) return;
            if (this.isInitialized) return;
            this.isInitialized = true;

            this.$nextTick(() => {
                this.initWorkspaceMap();
                this.initWorkspaceCharts();
                this.initResizeObserver();
                if (Alpine.store('app').activeProcessedData) {
                    this.updateHoverStats(0);
                    this.updateMapMarker(0);
                }
            });

            this.$watch('$store.app.hoveredTrackpoint', (index) => {
                if (index !== null) {
                    this.updateHoverStats(index);
                    this.updateMapMarker(index);
                    if (this.mainChart) this.mainChart.draw();
                }
            });
        },

        closeFullscreen() {
            Alpine.store('app').isFullscreenAnalysisActive = false;
        },

        initWorkspaceMap() {
            if (this.map) return;

            this.map = L.map('workspace-map', {
                zoomControl: false,
                attributionControl: false
            }).setView([0, 0], 2);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);

            const points = Alpine.store('app').activePoints;

            if (points && points.length > 0) {
                const latlngs = points.map(p => [p.lat, p.lon]);
                this.polyline = L.polyline(latlngs, { color: '#0062ff', weight: 4 }).addTo(this.map);
                this.map.fitBounds(this.polyline.getBounds());

                this.marker = L.circleMarker(latlngs[0], {
                    radius: 8,
                    fillColor: '#ff6b6b',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 1
                }).addTo(this.map);
            }
        },

        initWorkspaceCharts() {
            const data = Alpine.store('app').activeProcessedData;
            const type = Alpine.store('app').activeChartType;

            this.createMainChart(data, type);
            this.createSliderChart(data, type);
        },

        createMainChart(data, type) {
            const ctx = document.getElementById('workspace-chart-main').getContext('2d');
            const {start, end} = Alpine.store('app').zoomRange;
            const slicedData = data.slice(start, end + 1);
            const datasets = this.getDatasetsForType(slicedData, type);

            this.mainChart = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: {
                            type: 'linear',
                            display: true,
                            ticks: {
                                callback: (value) => value.toFixed(1) + ' km'
                            }
                        },
                        y: this.getYAxisConfig(type)
                    },
                    plugins: {
                        legend: { display: type === 'combo' || type === 'pace' },
                        tooltip: { enabled: false }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    onHover: (event, chartElements) => {
                        if (chartElements.length > 0) {
                            const index = chartElements[0].index;
                            // Map sliced index back to global index
                            const globalIndex = index + Alpine.store('app').zoomRange.start;
                            Alpine.store('app').hoveredTrackpoint = globalIndex;
                        }
                    }
                },
                plugins: [{
                    id: 'verticalLine',
                    afterDraw: (chart) => {
                        if (Alpine.store('app').hoveredTrackpoint !== null) {
                            const activeIndex = Alpine.store('app').hoveredTrackpoint - Alpine.store('app').zoomRange.start;
                            if (activeIndex >= 0 && activeIndex < chart.data.datasets[0].data.length) {
                                const ctx = chart.ctx;
                                const x = chart.scales.x.getPixelForValue(chart.data.datasets[0].data[activeIndex].x);
                                const topY = chart.chartArea.top;
                                const bottomY = chart.chartArea.bottom;

                                ctx.save();
                                ctx.beginPath();
                                ctx.moveTo(x, topY);
                                ctx.lineTo(x, bottomY);
                                ctx.lineWidth = 1;
                                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                                ctx.stroke();
                                ctx.restore();
                            }
                        }
                    }
                }]
            });
        },

        createSliderChart(data, type) {
            const canvas = document.getElementById('workspace-chart-slider');
            const ctx = canvas.getContext('2d');
            // Always show elevation for slider for context
            const sliderData = data.map(d => ({x: d.dist, y: d.ele}));

            this.sliderChart = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        data: sliderData,
                        borderColor: '#ccc',
                        backgroundColor: 'rgba(200, 200, 200, 0.2)',
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 1,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: 'linear', display: false },
                        y: { type: 'linear', display: false }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    }
                },
                plugins: [{
                    id: 'selectionRect',
                    afterDraw: (chart) => {
                        const {start, end} = Alpine.store('app').zoomRange;
                        const ctx = chart.ctx;
                        const xStart = chart.scales.x.getPixelForValue(chart.data.datasets[0].data[start].x);
                        const xEnd = chart.scales.x.getPixelForValue(chart.data.datasets[0].data[end].x);

                        ctx.save();
                        // Overlay
                        ctx.fillStyle = 'rgba(0, 98, 255, 0.1)';
                        ctx.fillRect(xStart, chart.chartArea.top, xEnd - xStart, chart.chartArea.height);

                        // Borders
                        ctx.strokeStyle = '#0062ff';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(xStart, chart.chartArea.top);
                        ctx.lineTo(xStart, chart.chartArea.bottom);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(xEnd, chart.chartArea.top);
                        ctx.lineTo(xEnd, chart.chartArea.bottom);
                        ctx.stroke();

                        // Handles
                        ctx.fillStyle = '#0062ff';
                        ctx.fillRect(xStart - 4, chart.chartArea.top + (chart.chartArea.height/2) - 10, 8, 20);
                        ctx.fillRect(xEnd - 4, chart.chartArea.top + (chart.chartArea.height/2) - 10, 8, 20);

                        ctx.restore();
                    }
                }]
            });

            // Interaction logic
            canvas.addEventListener('pointerdown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const value = this.sliderChart.scales.x.getValueForPixel(x);

                // Find nearest index
                const index = this.findNearestIndex(value);
                const {start, end} = Alpine.store('app').zoomRange;

                const xStart = this.sliderChart.scales.x.getPixelForValue(this.sliderChart.data.datasets[0].data[start].x);
                const xEnd = this.sliderChart.scales.x.getPixelForValue(this.sliderChart.data.datasets[0].data[end].x);

                if (Math.abs(x - xStart) < 15) {
                    this.isDragging = true;
                    this.dragType = 'start';
                } else if (Math.abs(x - xEnd) < 15) {
                    this.isDragging = true;
                    this.dragType = 'end';
                } else if (x > xStart && x < xEnd) {
                    this.isDragging = true;
                    this.dragType = 'pan';
                    this.dragOffset = index - start;
                } else {
                    // Jump to click
                    this.updateZoomFromSlider(index);
                }
                canvas.setPointerCapture(e.pointerId);
            });

            canvas.addEventListener('pointermove', (e) => {
                if (!this.isDragging) {
                    // Update cursor
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const {start, end} = Alpine.store('app').zoomRange;
                    const xStart = this.sliderChart.scales.x.getPixelForValue(this.sliderChart.data.datasets[0].data[start].x);
                    const xEnd = this.sliderChart.scales.x.getPixelForValue(this.sliderChart.data.datasets[0].data[end].x);

                    if (Math.abs(x - xStart) < 15 || Math.abs(x - xEnd) < 15) {
                        canvas.style.cursor = 'ew-resize';
                    } else if (x > xStart && x < xEnd) {
                        canvas.style.cursor = 'grab';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                    return;
                }

                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const value = this.sliderChart.scales.x.getValueForPixel(x);
                const index = this.findNearestIndex(value);
                const dataLength = Alpine.store('app').activeProcessedData.length;
                let {start, end} = Alpine.store('app').zoomRange;

                if (this.dragType === 'start') {
                    start = Math.max(0, Math.min(index, end - 10));
                } else if (this.dragType === 'end') {
                    end = Math.max(start + 10, Math.min(index, dataLength - 1));
                } else if (this.dragType === 'pan') {
                    const windowSize = end - start;
                    start = index - this.dragOffset;
                    if (start < 0) start = 0;
                    if (start + windowSize >= dataLength) start = dataLength - 1 - windowSize;
                    end = start + windowSize;
                }

                Alpine.store('app').zoomRange = { start, end };
                this.updateMainChart();
                this.sliderChart.draw();
            });

            canvas.addEventListener('pointerup', (e) => {
                this.isDragging = false;
                this.dragType = null;
                canvas.releasePointerCapture(e.pointerId);
            });
        },

        findNearestIndex(xValue) {
            const data = Alpine.store('app').activeProcessedData;
            let low = 0;
            let high = data.length - 1;
            while (low < high) {
                const mid = Math.floor((low + high) / 2);
                if (data[mid].dist < xValue) low = mid + 1;
                else high = mid;
            }
            return low;
        },

        updateZoomFromSlider(index) {
            const dataLength = Alpine.store('app').activeProcessedData.length;
            const windowSize = Math.floor(dataLength * 0.2); // 20% zoom window
            let start = index - Math.floor(windowSize / 2);
            let end = index + Math.floor(windowSize / 2);

            if (start < 0) {
                start = 0;
                end = windowSize;
            }
            if (end >= dataLength) {
                end = dataLength - 1;
                start = end - windowSize;
            }

            Alpine.store('app').zoomRange = { start, end };
            this.updateMainChart();
            this.sliderChart.draw();
        },

        updateMainChart() {
            const {start, end} = Alpine.store('app').zoomRange;
            const data = Alpine.store('app').activeProcessedData;
            const type = Alpine.store('app').activeChartType;

            const slicedData = data.slice(start, end + 1);
            const datasets = this.getDatasetsForType(slicedData, type);

            this.mainChart.data.datasets = datasets;
            this.mainChart.update();
        },

        getDatasetsForType(data, type) {
            if (type === 'elevation') {
                return [{
                    label: 'Elevation (m)',
                    data: data.map(d => ({x: d.dist, y: d.ele})),
                    borderColor: '#0062ff',
                    backgroundColor: 'rgba(0, 98, 255, 0.1)',
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.3
                }];
            } else if (type === 'pace') {
                return [
                    {
                        label: 'Pace',
                        data: data.map(d => ({x: d.dist, y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null})),
                        borderColor: '#ff6b6b',
                        pointRadius: 0,
                        borderWidth: 2.5,
                        tension: 0.4
                    },
                    {
                        label: 'GAP',
                        data: data.map(d => ({x: d.dist, y: d.smoothedGap > 0 && d.smoothedGap < 20 ? d.smoothedGap : null})),
                        borderColor: '#fab005',
                        borderDash: [4, 4],
                        pointRadius: 0,
                        borderWidth: 2,
                        tension: 0.4
                    }
                ];
            } else if (type === 'combo') {
                return [
                    {
                        label: 'Elevation',
                        data: data.map(d => ({x: d.dist, y: d.ele})),
                        borderColor: '#0062ff',
                        yAxisID: 'y-ele',
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'Pace',
                        data: data.map(d => ({x: d.dist, y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null})),
                        borderColor: '#ff6b6b',
                        yAxisID: 'y-pace',
                        pointRadius: 0,
                        borderWidth: 2
                    }
                ];
            }
            return [];
        },

        getYAxisConfig(type) {
            if (type === 'elevation') {
                return { title: { display: true, text: 'Elevation (m)' } };
            } else if (type === 'pace') {
                return { reverse: true, title: { display: true, text: 'Pace (min/km)' }, suggestedMin: 3, suggestedMax: 10 };
            } else if (type === 'combo') {
                return {
                    'y-ele': { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Elevation (m)' } },
                    'y-pace': { type: 'linear', display: true, position: 'right', reverse: true, title: { display: true, text: 'Pace (min/km)' }, grid: { drawOnChartArea: false }, suggestedMin: 3, suggestedMax: 10 }
                };
            }
        },

        updateHoverStats(index) {
            const data = Alpine.store('app').activeProcessedData;
            const d = data[index];
            if (!d) return;

            this.hoverStats.distance = d.dist.toFixed(2) + ' km';
            this.hoverStats.pace = window.gpxUtils.formatPace(d.smoothedPace);

            // Calculate grade
            let grade = 0;
            if (index > 0) {
                const dd = (data[index].dist - data[index-1].dist) * 1000;
                const de = data[index].ele - data[index-1].ele;
                if (dd > 0) grade = (de / dd) * 100;
            }
            this.hoverStats.grade = grade.toFixed(1) + '%';
            this.hoverStats.elevation = d.ele.toFixed(0) + ' m';
        },

        initResizeObserver() {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.mainChart) this.mainChart.resize();
                if (this.sliderChart) this.sliderChart.resize();
                if (this.map) this.map.invalidateSize();
            });
            this.resizeObserver.observe(document.getElementById('fullscreen-analysis-workspace'));
        },

        updateMapMarker(index) {
            const points = Alpine.store('app').activePoints;
            const p = points[index];
            if (!p || !this.marker) return;

            const latlng = [p.lat, p.lon];
            this.marker.setLatLng(latlng);

            // Pan map if marker goes out of bounds, throttled to 100ms
            const now = Date.now();
            if (now - this.lastPanTime > 100) {
                if (!this.map.getBounds().contains(latlng)) {
                    this.map.panTo(latlng);
                    this.lastPanTime = now;
                }
            }
        },

        destroy() {
            if (this.mainChart) {
                this.mainChart.destroy();
                this.mainChart = null;
            }
            if (this.sliderChart) {
                this.sliderChart.destroy();
                this.sliderChart = null;
            }
            if (this.map) {
                this.map.remove();
                this.map = null;
            }
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            this.marker = null;
            this.polyline = null;
            this.isInitialized = false;
            Alpine.store('app').hoveredTrackpoint = null;
        }
    }));
});
