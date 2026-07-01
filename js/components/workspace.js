document.addEventListener('alpine:init', () => {
    Alpine.data('workspace', () => ({
        map: null,
        mainChart: null,
        sliderChart: null,
        marker: null,
        // Dual polylines for Task 3: muted background + bold highlighted foreground
        backgroundPolyline: null,
        highlightedPolyline: null,
        hoverStats: {
            distance: '0.00 km',
            pace: '0:00',
            gap: '0:00',
            grade: '0%',
            elevation: '0 m'
        },

        isInitialized: false,
        lastPanTime: 0,
        resizeObserver: null,
        isDragging: false,
        dragType: null, // 'pan', 'start', 'end'
        dragOffset: 0,

        // --- Task 2: throttling state for scrubber -> main chart updates ---
        // Pending zoom range waiting to be flushed on the next animation frame.
        _pendingZoomRange: null,
        // Non-null when an rAF callback is scheduled.
        _rafId: null,
        // The last zoom range we actually flushed, used to skip no-op updates.
        _lastFlushedZoom: null,
        // True while a drag is in progress; disables full-fidelity rendering.
        _draggingActive: false,

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
                    // Show segment averages (full range) instead of point-0 values
                    // as the initial fallback display per Task 1.2.
                    this.updateHoverStatsToSegmentAverages();
                    this.updateMapMarker(0);
                }
            });

            this.$watch('$store.app.hoveredTrackpoint', (index) => {
                if (index !== null) {
                    // updateHoverStats is wrapped in try/catch so a stats
                    // formatting error never blocks the map marker / chart
                    // redraw from running.
                    try { this.updateHoverStats(index); } catch (e) { console.warn('updateHoverStats:', e); }
                    this.updateMapMarker(index);
                    if (this.mainChart) Alpine.raw(this.mainChart).draw();
                } else {
                    // Hover ended -> fall back to active segment averages (Task 1.2)
                    try { this.updateHoverStatsToSegmentAverages(); } catch (e) { console.warn('updateHoverStatsToSegmentAverages:', e); }
                    if (this.mainChart) Alpine.raw(this.mainChart).draw();
                }
            });
        },

        closeFullscreen() {
            Alpine.store('app').isFullscreenAnalysisActive = false;
        },

        initWorkspaceMap() {
            if (this.map) return;

            const map = L.map('workspace-map', {
                zoomControl: false,
                attributionControl: false
            }).setView([0, 0], 2);
            // Assign to the reactive property, but keep a raw local reference for
            // all method calls so Alpine's proxy never interferes with Leaflet.
            this.map = map;
            const rawMap = Alpine.raw(this.map);

            L.tileLayer.offline('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(rawMap);

            const points = Alpine.store('app').activePoints;

            if (points && points.length > 0) {
                // Plain (non-proxied) latlng array — never hand Alpine-proxied
                // objects to Leaflet.
                const latlngs = points.map(p => [p.lat, p.lon]);

                // Task 3.1: Initialize dual polyline layers.
                // backgroundPolyline: thin, muted, low z-index — shows full route context.
                const bg = L.polyline(latlngs, {
                    color: '#6c757d',
                    weight: 3,
                    opacity: 0.55,
                    lineJoin: 'round',
                    lineCap: 'round',
                    interactive: false
                }).addTo(rawMap);
                this.backgroundPolyline = bg;

                // highlightedPolyline: bold, high-visibility, high z-index — shows active subset.
                const hl = L.polyline(latlngs, {
                    color: '#0062ff',
                    weight: 6,
                    opacity: 1,
                    lineJoin: 'round',
                    lineCap: 'round',
                    interactive: false
                }).addTo(rawMap);
                this.highlightedPolyline = hl;

                // Bring foreground explicitly above background.
                Alpine.raw(this.highlightedPolyline).bringToFront();

                rawMap.fitBounds(Alpine.raw(this.backgroundPolyline).getBounds());

                this.marker = L.circleMarker(latlngs[0], {
                    radius: 8,
                    fillColor: '#ff6b6b',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 1
                }).addTo(rawMap);

                // Sync the highlighted layer to the initial zoom range.
                const { start, end } = Alpine.store('app').zoomRange;
                this.updateHighlightedPolyline(start, end);
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

            // Set explicit x-axis min/max from the sliced data so the line
            // stretches edge-to-edge (no empty padding to 'nice' round
            // numbers) and the axis doesn't rescale/jump on scrubber updates.
            const xMin = slicedData.length > 0 ? slicedData[0].dist : 0;
            const xMax = slicedData.length > 0 ? slicedData[slicedData.length - 1].dist : 0;

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
                            min: xMin,
                            max: xMax,
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

            // Task 1.2: When the cursor leaves the main chart, reset the stats
            // banner back to the active segment averages (hover fallback).
            const mainCanvas = document.getElementById('workspace-chart-main');
            // touch-action: none lets Chart.js receive touch-drag events on
            // mobile so onHover fires while a finger drags across the chart.
            mainCanvas.style.touchAction = 'none';
            mainCanvas.addEventListener('mouseleave', () => {
                Alpine.store('app').hoveredTrackpoint = null;
            });
            // On touch devices, tap-and-leave should also fall back. pointerleave
            // covers both mouse and touch scenarios.
            mainCanvas.addEventListener('pointerleave', () => {
                if (Alpine.store('app').hoveredTrackpoint !== null) {
                    Alpine.store('app').hoveredTrackpoint = null;
                }
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
                    animation: false,
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

                        // Handles — drawn larger for better mobile visibility (Task 2.3).
                        // The actual touch target is enlarged separately in pointer hit
                        // detection (HIT_RADIUS_PX) to reach a 44px physical target.
                        const handleW = 14;
                        const handleH = Math.min(32, chart.chartArea.height - 4);
                        const handleY = chart.chartArea.top + (chart.chartArea.height / 2) - (handleH / 2);
                        const handleRadius = 3;
                        const drawHandle = (cx) => {
                            const x = cx - handleW / 2;
                            ctx.fillStyle = '#0062ff';
                            ctx.beginPath();
                            ctx.moveTo(x + handleRadius, handleY);
                            ctx.arcTo(x + handleW, handleY, x + handleW, handleY + handleH, handleRadius);
                            ctx.arcTo(x + handleW, handleY + handleH, x, handleY + handleH, handleRadius);
                            ctx.arcTo(x, handleY + handleH, x, handleY, handleRadius);
                            ctx.arcTo(x, handleY, x + handleW, handleY, handleRadius);
                            ctx.closePath();
                            ctx.fill();
                            // Grip lines for affordance
                            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                            ctx.lineWidth = 1.5;
                            ctx.beginPath();
                            ctx.moveTo(cx - 2, handleY + 6);
                            ctx.lineTo(cx - 2, handleY + handleH - 6);
                            ctx.moveTo(cx + 2, handleY + 6);
                            ctx.lineTo(cx + 2, handleY + handleH - 6);
                            ctx.stroke();
                        };
                        drawHandle(xStart);
                        drawHandle(xEnd);

                        ctx.restore();
                    }
                }]
            });

            // Task 2.3: Hit radius for grab handles. A radius of 22px yields a 44px
            // physical touch target diameter, meeting mobile accessibility guidance.
            const HIT_RADIUS_PX = 22;

            // Helper: which drag zone is the cursor over?
            // NOTE: access the slider chart via Alpine.raw() to bypass Alpine's
            // reactive proxy — Chart.js's internal property accessors recurse
            // when invoked through the proxy, causing stack overflow.
            const hitTest = (x) => {
                const slider = Alpine.raw(this.sliderChart);
                const {start, end} = Alpine.store('app').zoomRange;
                const xStart = slider.scales.x.getPixelForValue(slider.data.datasets[0].data[start].x);
                const xEnd = slider.scales.x.getPixelForValue(slider.data.datasets[0].data[end].x);
                if (Math.abs(x - xStart) <= HIT_RADIUS_PX) return 'start';
                if (Math.abs(x - xEnd) <= HIT_RADIUS_PX) return 'end';
                if (x > xStart && x < xEnd) return 'pan';
                return null;
            };

            canvas.addEventListener('pointerdown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const slider = Alpine.raw(this.sliderChart);
                const value = slider.scales.x.getValueForPixel(x);
                const index = this.findNearestIndex(value);

                const zone = hitTest(x);
                if (zone === 'start') {
                    this.isDragging = true;
                    this.dragType = 'start';
                } else if (zone === 'end') {
                    this.isDragging = true;
                    this.dragType = 'end';
                } else if (zone === 'pan') {
                    this.isDragging = true;
                    this.dragType = 'pan';
                    const {start} = Alpine.store('app').zoomRange;
                    this.dragOffset = index - start;
                } else {
                    // Jump to click — apply immediately (no drag).
                    this.updateZoomFromSlider(index);
                }

                if (this.isDragging) {
                    this._draggingActive = true;
                    canvas.setPointerCapture(e.pointerId);
                }
            });

            canvas.addEventListener('pointermove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;

                if (!this.isDragging) {
                    // Update cursor affordance only.
                    const zone = hitTest(x);
                    if (zone === 'start' || zone === 'end') {
                        canvas.style.cursor = 'ew-resize';
                    } else if (zone === 'pan') {
                        canvas.style.cursor = 'grab';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                    return;
                }

                // Compute the new bounds from the pointer position.
                const slider = Alpine.raw(this.sliderChart);
                const value = slider.scales.x.getValueForPixel(x);
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

                // Task 2.1: throttle the expensive main-chart redraw via rAF
                // instead of updating on every pointermove event. The slider
                // overlay itself is cheap (single draw()) so we redraw it
                // immediately for responsive handle feedback.
                this.scheduleZoomUpdate(start, end);
                Alpine.raw(this.sliderChart).draw();
            });

            const endDrag = (e) => {
                if (!this.isDragging) return;
                this.isDragging = false;
                this.dragType = null;
                this._draggingActive = false;
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                // Task 2.1: guarantee the final position is always processed
                // (drag end / touchend / mouseup) for accuracy.
                this.flushZoomUpdate();
            };

            canvas.addEventListener('pointerup', endDrag);
            canvas.addEventListener('pointercancel', endDrag);

            // Task 2.3: prevent the browser from interpreting touch drags on the
            // slider as scroll/pinch gestures so mobile fingers can grab handles.
            canvas.style.touchAction = 'none';
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
            if (start < 0) start = 0;

            // A click-jump is a discrete action; flush immediately for snappy UX.
            this.scheduleZoomUpdate(start, end);
            this.flushZoomUpdate();
        },

        // --- Task 2.1: rAF-based throttling for main chart updates ---
        /**
         * Stage a new zoom range and request a single animation frame to apply it.
         * Multiple pointermove events within the same frame coalesce into one
         * main-chart redraw.
         */
        scheduleZoomUpdate(start, end) {
            this._pendingZoomRange = { start, end };
            if (this._rafId !== null) return;
            this._rafId = requestAnimationFrame(() => {
                this._rafId = null;
                this.flushZoomUpdate();
            });
        },

        /**
         * Apply the pending zoom range (if any) to the store, main chart, slider
         * overlay, and highlighted polyline. Safe to call when nothing is pending.
         */
        flushZoomUpdate() {
            // Cancel any pending rAF callback — we are flushing synchronously now.
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            const pending = this._pendingZoomRange;
            this._pendingZoomRange = null;
            if (!pending) return;

            // Skip no-op updates (same bounds as last flush).
            const last = this._lastFlushedZoom;
            if (last && last.start === pending.start && last.end === pending.end) {
                return;
            }

            Alpine.store('app').zoomRange = { start: pending.start, end: pending.end };
            this._lastFlushedZoom = { start: pending.start, end: pending.end };

            // Always update the main chart in 'none' mode (no animation) for
            // instant, jump-free redraws. animation:false is set globally but
            // update('none') also skips layout transitions which would
            // otherwise cause the chart to visibly rescale on every scrub.
            this.updateMainChart();
            this.updateHighlightedPolyline(pending.start, pending.end);
            if (this.sliderChart) Alpine.raw(this.sliderChart).draw();
        },

        updateMainChart() {
            if (!this.mainChart) return;
            const {start, end} = Alpine.store('app').zoomRange;
            const data = Alpine.store('app').activeProcessedData;
            const type = Alpine.store('app').activeChartType;

            const slicedData = data.slice(start, end + 1);
            const datasets = this.getDatasetsForType(slicedData, type);

            // Access the chart via Alpine.raw() to avoid the reactive proxy.
            // Assigning proxied arrays / calling update() through the proxy
            // triggers infinite recursion inside Chart.js's own property
            // accessors (the Alpine proxy and Chart.js's internal proxy
            // re-enter each other). Deep-cloning the datasets also ensures no
            // Alpine-proxied objects leak into Chart.js's data tree.
            const chart = Alpine.raw(this.mainChart);
            chart.data.datasets = JSON.parse(JSON.stringify(datasets));

            // Set explicit x-axis min/max from the sliced data so the line
            // fills the full chart width (no empty padding to 'nice' round
            // numbers) and the axis doesn't rescale/jump between updates.
            if (slicedData.length > 0) {
                chart.options.scales.x.min = slicedData[0].dist;
                chart.options.scales.x.max = slicedData[slicedData.length - 1].dist;
            }

            // 'none' = no animation, no layout transition. Keeps scrubbing
            // smooth and prevents the visual 'jump' from axis rescaling.
            chart.update('none');
        },

        // --- Task 3.2: sync highlighted polyline to scrubber bounds ---
        /**
         * Slice the full coordinate array to the active [start, end] window and
         * update the foreground polyline in place. Covered by the same rAF
         * throttling as the chart updates because flushZoomUpdate() is the only
         * caller during dragging.
         */
        updateHighlightedPolyline(start, end) {
            if (!this.highlightedPolyline) return;
            const points = Alpine.store('app').activePoints;
            if (!points || points.length === 0) return;

            const s = Math.max(0, Math.min(start, points.length - 1));
            const e = Math.max(s, Math.min(end, points.length - 1));
            // Build a plain (non-proxied) array of plain [lat, lon] arrays so
            // Leaflet never receives an Alpine-proxied object.
            const activeCoords = points.slice(s, e + 1).map(p => [p.lat, p.lon]);
            if (activeCoords.length > 0) {
                Alpine.raw(this.highlightedPolyline).setLatLngs(activeCoords);
            }
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
                        data: data.map(d => ({x: d.dist, y: window.gpxUtils.isValidPace(d.smoothedPace) ? d.smoothedPace : null})),
                        borderColor: '#ff6b6b',
                        pointRadius: 0,
                        borderWidth: 2.5,
                        tension: 0.4
                    },
                    {
                        label: 'GAP',
                        data: data.map(d => ({x: d.dist, y: window.gpxUtils.isValidPace(d.smoothedGap) ? d.smoothedGap : null})),
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
                        data: data.map(d => ({x: d.dist, y: window.gpxUtils.isValidPace(d.smoothedPace) ? d.smoothedPace : null})),
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

        // Task 1.2: update banner metrics from a specific hovered trackpoint.
        updateHoverStats(index) {
            const data = Alpine.store('app').activeProcessedData;
            const d = data[index];
            if (!d) return;

            // IMPORTANT: the global is window.gpxUtils (camelCase), as defined
            // in js/gpx-utils.js. The previous snake_case 'gpx_utils' was
            // undefined and threw a TypeError here, which silently blocked
            // elevation / pace / GAP from updating AND blocked the map marker
            // from moving (updateMapMarker runs after this in the watcher).
            const fmt = window.gpxUtils ? window.gpxUtils.formatPace.bind(window.gpxUtils) : (v) => v.toFixed(2);

            this.hoverStats.distance = d.dist.toFixed(2) + ' km';
            this.hoverStats.pace = fmt(d.smoothedPace);
            this.hoverStats.gap = fmt(d.smoothedGap);

            // Calculate grade (kept for completeness / potential future use).
            let grade = 0;
            if (index > 0) {
                const dd = (data[index].dist - data[index-1].dist) * 1000;
                const de = data[index].ele - data[index-1].ele;
                if (dd > 0) grade = (de / dd) * 100;
            }
            this.hoverStats.grade = grade.toFixed(1) + '%';
            this.hoverStats.elevation = d.ele != null ? d.ele.toFixed(0) + ' m' : '—';
        },

        // Task 1.2 fallback: when the user is not hovering, show the average
        // metrics across the currently selected (scrubber) segment.
        updateHoverStatsToSegmentAverages() {
            const data = Alpine.store('app').activeProcessedData;
            if (!data || data.length === 0) return;
            const { start, end } = Alpine.store('app').zoomRange;
            const s = Math.max(0, Math.min(start, data.length - 1));
            const e = Math.max(s, Math.min(end, data.length - 1));
            const slice = data.slice(s, e + 1);
            if (slice.length === 0) return;

            // Distance span of the active segment.
            const distStart = slice[0].dist;
            const distEnd = slice[slice.length - 1].dist;
            this.hoverStats.distance = (distEnd - distStart).toFixed(2) + ' km';

            // Average pace / GAP across the segment (ignore zero/invalid samples).
            let paceSum = 0, gapSum = 0, paceCount = 0;
            let eleMin = Infinity, eleMax = -Infinity;
            for (const d of slice) {
                if (window.gpxUtils.isValidPace(d.smoothedPace)) {
                    paceSum += d.smoothedPace;
                    paceCount++;
                }
                if (window.gpxUtils.isValidPace(d.smoothedGap)) {
                    gapSum += d.smoothedGap;
                }
                if (d.ele != null) {
                    if (d.ele < eleMin) eleMin = d.ele;
                    if (d.ele > eleMax) eleMax = d.ele;
                }
            }
            const avgPace = paceCount > 0 ? paceSum / paceCount : 0;
            const avgGap = paceCount > 0 ? gapSum / paceCount : 0;
            // window.gpxUtils (camelCase) — see note in updateHoverStats().
            const fmt = window.gpxUtils ? window.gpxUtils.formatPace.bind(window.gpxUtils) : (v) => v.toFixed(2);
            this.hoverStats.pace = fmt(avgPace);
            this.hoverStats.gap = fmt(avgGap);

            // Show elevation range (min–max) of the active segment.
            if (eleMin !== Infinity) {
                this.hoverStats.elevation = eleMin.toFixed(0) + '–' + eleMax.toFixed(0) + ' m';
            } else {
                this.hoverStats.elevation = '—';
            }
            this.hoverStats.grade = '—';
        },

        initResizeObserver() {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.mainChart) Alpine.raw(this.mainChart).resize();
                if (this.sliderChart) Alpine.raw(this.sliderChart).resize();
                if (this.map) Alpine.raw(this.map).invalidateSize();
            });
            this.resizeObserver.observe(document.getElementById('fullscreen-analysis-workspace'));
        },

        updateMapMarker(index) {
            const points = Alpine.store('app').activePoints;
            const p = points[index];
            if (!p || !this.marker) return;

            const latlng = [p.lat, p.lon];
            const map = Alpine.raw(this.map);
            const marker = Alpine.raw(this.marker);
            marker.setLatLng(latlng);

            // Pan map if marker goes out of bounds, throttled to 100ms
            const now = Date.now();
            if (now - this.lastPanTime > 100) {
                if (!map.getBounds().contains(latlng)) {
                    map.panTo(latlng);
                    this.lastPanTime = now;
                }
            }
        },

        destroy() {
            // Cancel any pending throttled frame so it can't fire after teardown.
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            this._pendingZoomRange = null;
            this._lastFlushedZoom = null;
            this._draggingActive = false;

            if (this.mainChart) {
                Alpine.raw(this.mainChart).destroy();
                this.mainChart = null;
            }
            if (this.sliderChart) {
                Alpine.raw(this.sliderChart).destroy();
                this.sliderChart = null;
            }
            if (this.map) {
                Alpine.raw(this.map).remove();
                this.map = null;
            }
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            this.marker = null;
            this.backgroundPolyline = null;
            this.highlightedPolyline = null;
            this.isInitialized = false;
            Alpine.store('app').hoveredTrackpoint = null;
        }
    }));
});
