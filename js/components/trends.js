document.addEventListener('alpine:init', () => {
    Alpine.data('trends', () => ({
        chart: null,

        init() {
            this.$watch('$store.app.groupedFiles', () => {
                if (Alpine.store('app').activeTab === 'trends') {
                    setTimeout(() => this.updateChart(), 200);
                }
            });

            // Initial chart render if we are on trends tab or when we switch to it
            window.addEventListener('tab-changed', (e) => {
                if (e.detail.tab === 'trends') {
                    setTimeout(() => this.updateChart(), 200);
                }
            });

            if (Alpine.store('app').activeTab === 'trends') {
                setTimeout(() => this.updateChart(), 200);
            }
        },

        updateChart() {
            const groups = [...Alpine.store('app').groupedFiles].reverse(); // Show oldest to newest
            if (groups.length === 0) return;

            const canvas = document.getElementById('monthly-volume-chart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            if (this.chart) {
                this.chart.destroy();
            }

            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: groups.map(g => g.label),
                    datasets: [{
                        label: 'Distance (km)',
                        data: groups.map(g => g.totalDistance),
                        backgroundColor: '#0062ff',
                        borderRadius: 8,
                        hoverBackgroundColor: '#004ecc'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: { size: 14, weight: 'bold' },
                            bodyFont: { size: 13 },
                            displayColors: false,
                            callbacks: {
                                label: (context) => `Total: ${context.parsed.y.toFixed(2)} km`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f3f5' },
                            title: {
                                display: true,
                                text: 'Distance (km)',
                                font: { weight: 'bold' }
                            }
                        },
                        x: {
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        formatLifetimeDuration(ms) {
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            return `${hours}h ${minutes}m`;
        }
    }));
});
