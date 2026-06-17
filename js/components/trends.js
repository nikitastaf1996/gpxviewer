document.addEventListener('alpine:init', () => {
    Alpine.data('trends', () => ({
        globalChart: null,
        monthlyCharts: {}, // label -> chartInstance
        isInitialized: false,
        auraAnimationId: null,
        blotches: [
            { id: 'b-diffuse-pink',   x: -12, y: -10, rx: 14, ry: 10, speedX: 0.0006, speedY: 0.0004, phase: 0 },
            { id: 'b-diffuse-orange', x: 12,  y: 10,  rx: 12, ry: 12, speedX: -0.0004, speedY: 0.0006, phase: 1.5 },
            { id: 'b-edged-pink',     x: -15, y: -5,  rx: 15, ry: 12, speedX: -0.0008, speedY: 0.0005, phase: 3.1 },
            { id: 'b-edged-cyan',     x: 10,  y: -15, rx: 14, ry: 15, speedX: 0.0007, speedY: -0.0006, phase: 4.8 },
            { id: 'b-edged-blue',     x: -8,  y: 12,  rx: 12, ry: 14, speedX: -0.0005, speedY: -0.0007, phase: 0.8 },
            { id: 'b-edged-yellow',   x: 0,   y: 0,   rx: 8,  ry: 8,  speedX: 0.0010, speedY: -0.0008, phase: 2.2 }
        ],

        globalChartIndex: 0,
        globalChartTypes: [
            { id: 'distance', label: 'Monthly Distance', unit: 'km', color: '#0062ff' },
            { id: 'duration', label: 'Monthly Time', unit: 'h', color: '#4dabf7' },
            { id: 'runs', label: 'Runs per Month', unit: 'runs', color: '#228be6' },
            { id: 'pace', label: 'Avg Pace', unit: '/km', color: '#1c7ed6' },
            { id: 'calories', label: 'Avg Calories', unit: 'kcal', color: '#1971c2' }
        ],

        monthlyChartIndex: 0,
        monthlyChartTypes: [
            { id: 'distance', label: 'Distance', unit: 'km', color: '#0062ff' },
            { id: 'duration', label: 'Time', unit: 'min', color: '#4dabf7' },
            { id: 'pace', label: 'Pace', unit: '/km', color: '#1c7ed6' },
            { id: 'calories', label: 'Calories', unit: 'kcal', color: '#1971c2' }
        ],

        get globalChartTitle() {
            return this.globalChartTypes[this.globalChartIndex].label;
        },

        get monthlyChartTitle() {
            return this.monthlyChartTypes[this.monthlyChartIndex].label;
        },

        init() {
            if (this.isInitialized) return;
            this.isInitialized = true;

            this.$watch('$store.app.groupedFiles', (newValue, oldValue) => {
                if (Alpine.store('app').activeTab === 'trends') {
                    // Only update chart if the number of files or total distance changed
                    const newTotalFiles = newValue.reduce((sum, g) => sum + g.files.length, 0);
                    const oldTotalFiles = oldValue ? oldValue.reduce((sum, g) => sum + g.files.length, 0) : 0;
                    const newTotalDist = newValue.reduce((sum, g) => sum + g.totalDistance, 0);
                    const oldTotalDist = oldValue ? oldValue.reduce((sum, g) => sum + g.totalDistance, 0) : 0;

                    if (newTotalFiles !== oldTotalFiles || Math.abs(newTotalDist - oldTotalDist) > 0.01) {
                        setTimeout(() => this.refreshAll(), 200);
                    }
                }
            });

            // Initial chart render if we are on trends tab or when we switch to it
            window.addEventListener('tab-changed', (e) => {
                if (e.detail.tab === 'trends') {
                    setTimeout(() => this.refreshAll(), 200);
                    this.startAuraAnimation();
                } else {
                    this.stopAuraAnimation();
                }
            });

            if (Alpine.store('app').activeTab === 'trends') {
                setTimeout(() => this.refreshAll(), 200);
                this.startAuraAnimation();
            }
        },

        startAuraAnimation() {
            if (this.auraAnimationId) return;

            const animate = (time) => {
                for (let i = 0; i < this.blotches.length; i++) {
                    const b = this.blotches[i];
                    const el = document.getElementById(b.id);
                    if (el) {
                        const dx = b.x + Math.sin(time * b.speedX + b.phase) * b.rx;
                        const dy = b.y + Math.cos(time * b.speedY + b.phase) * b.ry;
                        el.style.transform = `translate3d(calc(-50% + ${dx}vw), calc(-50% + ${dy}vh), 0)`;
                    }
                }
                this.auraAnimationId = requestAnimationFrame(animate);
            };

            this.auraAnimationId = requestAnimationFrame(animate);
        },

        stopAuraAnimation() {
            if (this.auraAnimationId) {
                cancelAnimationFrame(this.auraAnimationId);
                this.auraAnimationId = null;
            }
        },

        refreshAll() {
            this.updateGlobalChart();
            this.refreshMonthlyCharts();
        },

        nextGlobalChart() {
            this.globalChartIndex = (this.globalChartIndex + 1) % this.globalChartTypes.length;
            this.updateGlobalChart();
        },

        prevGlobalChart() {
            this.globalChartIndex = (this.globalChartIndex - 1 + this.globalChartTypes.length) % this.globalChartTypes.length;
            this.updateGlobalChart();
        },

        nextMonthlyChart() {
            this.monthlyChartIndex = (this.monthlyChartIndex + 1) % this.monthlyChartTypes.length;
            this.refreshMonthlyCharts();
        },

        prevMonthlyChart() {
            this.monthlyChartIndex = (this.monthlyChartIndex - 1 + this.monthlyChartTypes.length) % this.monthlyChartTypes.length;
            this.refreshMonthlyCharts();
        },

        refreshMonthlyCharts() {
            // Re-render all currently existing monthly charts
            Alpine.store('app').groupedFiles.forEach(group => {
                const canvasId = 'chart-' + group.label.replace(' ', '-');
                const canvas = document.getElementById(canvasId);
                if (canvas) {
                    this.updateMonthlyChart(group);
                }
            });
        },

        updateGlobalChart() {
            const groups = [...Alpine.store('app').groupedFiles].reverse(); // Show oldest to newest
            if (groups.length === 0) return;

            const canvas = document.getElementById('global-trends-chart');
            if (!canvas) return;

            // Ensure old chart is destroyed before creating new one
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }

            const ctx = canvas.getContext('2d');
            const type = this.globalChartTypes[this.globalChartIndex];

            const data = groups.map(g => {
                switch(type.id) {
                    case 'distance': return g.totalDistance;
                    case 'duration': return g.totalDuration / (1000 * 60 * 60); // hours
                    case 'runs': return g.runCount;
                    case 'pace': return g.avgPace;
                    case 'calories': return g.totalCalories / g.runCount; // avg calories per run
                    default: return 0;
                }
            });

            this.globalChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: groups.map(g => g.label),
                    datasets: [{
                        label: `${type.label} (${type.unit})`,
                        data: data,
                        backgroundColor: type.color,
                        borderRadius: 8,
                        hoverBackgroundColor: type.color + 'cc'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            displayColors: false,
                            callbacks: {
                                label: (context) => {
                                    let val = context.parsed.y;
                                    if (type.id === 'pace') return `Avg Pace: ${window.gpxUtils.formatPace(val)}`;
                                    if (type.id === 'duration') return `Total Time: ${val.toFixed(1)} h`;
                                    return `${type.label}: ${val.toFixed(type.id === 'runs' ? 0 : 2)} ${type.unit}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f3f5' },
                            title: {
                                display: true,
                                text: `${type.label} (${type.unit})`,
                                font: { weight: 'bold' }
                            }
                        },
                        x: { grid: { display: false } }
                    }
                }
            });
        },

        updateMonthlyChart(group) {
            const canvasId = 'chart-' + group.label.replace(' ', '-');
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            // Ensure old chart is destroyed before creating new one
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }

            const ctx = canvas.getContext('2d');
            const type = this.monthlyChartTypes[this.monthlyChartIndex];
            const files = [...group.files].reverse(); // Oldest to newest in month

            const data = files.map(f => {
                switch(type.id) {
                    case 'distance': return f.distance;
                    case 'duration': return f.duration / (1000 * 60); // minutes
                    case 'pace': return f.avgPace;
                    case 'calories': return f.distance * (Alpine.store('app').userWeight || 70) * 1.036;
                    default: return 0;
                }
            });

            this.monthlyCharts[group.label] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: files.map(f => new Date(f.date).getDate()),
                    datasets: [{
                        label: `${type.label} (${type.unit})`,
                        data: data,
                        backgroundColor: type.color,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    const file = files[items[0].dataIndex];
                                    return new Date(file.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                                },
                                label: (context) => {
                                    let val = context.parsed.y;
                                    if (type.id === 'pace') return `Pace: ${window.gpxUtils.formatPace(val)}`;
                                    return `${type.label}: ${val.toFixed(1)} ${type.unit}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        x: { grid: { display: false }, title: { display: true, text: 'Day of Month', font: { size: 10 } } }
                    }
                }
            });
        },

        getMonthlySummaryText(group) {
            const type = this.monthlyChartTypes[this.monthlyChartIndex];
            switch(type.id) {
                case 'distance': return group.totalDistance.toFixed(1) + ' km';
                case 'duration':
                    const mins = group.totalDuration / (1000 * 60);
                    const h = Math.floor(mins / 60);
                    const m = Math.round(mins % 60);
                    return (h > 0 ? h + 'h ' : '') + m + 'm';
                case 'pace': return window.gpxUtils.formatPace(group.avgPace);
                case 'calories': return group.totalCalories + ' kcal';
                default: return '';
            }
        },

        formatLifetimeDuration(ms) {
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            return `${hours}h ${minutes}m`;
        }
    }));
});
