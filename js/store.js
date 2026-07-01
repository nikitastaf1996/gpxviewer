document.addEventListener('alpine:init', () => {
    Alpine.store('app', {
        activeTab: 'library',
        savedFiles: [],
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        activeGpx: null,
        activeGpxStats: {
            distance: null,
            duration: null,
            movingTime: null,
            pace: null,
            movingPace: null,
            elevationGain: null,
            elevationLoss: null,
            location: null,
            startTime: null,
            calories: null,
            customName: null
        },
        lifetimeStats: {
            totalDistance: 0,
            totalDuration: 0,
            runCount: 0,
            avgPace: 0,
            totalCalories: 0
        },
        groupedFiles: [],
        topLocations: [],
        visibleCharts: {
            elevation: true,
            pace: true,
            combo: true,
            climb: true,
            splits: true
        },
        geocodingEntity: 'city',
        userWeight: 70,
        showLiquidAura: true,
        isFullscreenAnalysisActive: false,
        activeChartType: '',
        zoomRange: { start: 0, end: 100 },
        hoveredTrackpoint: null,
        activePoints: null,
        activeProcessedData: null,

        showTab(tabId) {
            this.activeTab = tabId;
            // Emit event to notify components to resize map/charts/etc
            window.dispatchEvent(new CustomEvent('tab-changed', { detail: { tab: tabId } }));
        },

        // In-page modal + toast primitives. See index.html (#modal-root, #toast-root).
        _toastTimer: null,
        confirm(options) {
            const root = document.getElementById('modal-root');
            const data = root && root._x_dataStack ? root._x_dataStack[0] : null;
            if (!data) {
                // Fallback during early init / SSR / no-Alpine context.
                if (window.confirm(options.message || '')) {
                    try { options.onConfirm && options.onConfirm(); } catch (e) { console.error(e); }
                }
                return;
            }
            data.title = options.title || 'Confirm';
            data.message = options.message || '';
            data.onConfirm = options.onConfirm || null;
            data.open = true;
        },
        toast(message) {
            const root = document.getElementById('toast-root');
            const data = root && root._x_dataStack ? root._x_dataStack[0] : null;
            if (!data) { console.log('[toast]', message); return; }
            data.message = message;
            data.visible = true;
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => { data.visible = false; }, 3500);
        },

        initOnlineListeners() {
            window.addEventListener('online', () => { this.isOnline = true; });
            window.addEventListener('offline', () => { this.isOnline = false; });
        },

        async loadSettings() {
            const saved = await window.dbManager.get('settings', 'gpxViewerSettings');
            if (saved) {
                if (saved.visibleCharts) {
                    // New format
                    this.visibleCharts = saved.visibleCharts;
                    this.geocodingEntity = saved.geocodingEntity || 'city';
                    this.userWeight = saved.userWeight || 70;
                    this.showLiquidAura = saved.showLiquidAura !== undefined ? saved.showLiquidAura : true;
                } else {
                    // Legacy format
                    this.visibleCharts = saved;
                }
            }
        },

        async saveSettings() {
            const settings = {
                visibleCharts: JSON.parse(JSON.stringify(this.visibleCharts)),
                geocodingEntity: this.geocodingEntity,
                userWeight: this.userWeight,
                showLiquidAura: this.showLiquidAura
            };
            await window.dbManager.set('settings', 'gpxViewerSettings', settings);

            // Recalculate lifetime stats (like total calories) if weight changed
            await this.loadSavedMetadata();

            window.dispatchEvent(new CustomEvent('settings-updated'));
        },

        async loadSavedMetadata() {
            const savedMeta = await window.dbManager.getAll('metadata');
            this.savedFiles = Object.keys(savedMeta).map(id => ({
                id,
                ...savedMeta[id]
            })).sort((a, b) => new Date(b.date) - new Date(a.date));

            // Calculate lifetime stats
            let totalDist = 0;
            let totalDur = 0;
            let totalCals = 0;
            this.savedFiles.forEach(f => {
                totalDist += f.distance || 0;
                totalDur += f.duration || 0;
                totalCals += window.gpxUtils.calculateCalories(f.distance, this.userWeight);
            });
            this.lifetimeStats.totalDistance = totalDist;
            this.lifetimeStats.totalDuration = totalDur;
            this.lifetimeStats.runCount = this.savedFiles.length;
            this.lifetimeStats.avgPace = totalDist > 0 ? (totalDur / 1000 / 60) / totalDist : 0;
            this.lifetimeStats.totalCalories = Math.round(totalCals);

            // Calculate top 3 locations
            const locationCounts = {};
            this.savedFiles.forEach(f => {
                if (f.city) {
                    locationCounts[f.city] = (locationCounts[f.city] || 0) + 1;
                }
            });
            this.topLocations = Object.entries(locationCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([name, count]) => ({ name, count }));

            // Group files by month/year
            const groups = {};
            this.savedFiles.forEach(f => {
                const d = new Date(f.date);
                const month = d.toLocaleString('default', { month: 'long' });
                const year = d.getFullYear();
                const key = `${month} ${year}`;
                if (!groups[key]) {
                    groups[key] = {
                        label: key,
                        files: [],
                        totalDistance: 0,
                        totalDuration: 0,
                        totalCalories: 0,
                        runCount: 0,
                        avgPace: 0
                    };
                }
                groups[key].files.push(f);
                groups[key].totalDistance += f.distance || 0;
                groups[key].totalDuration += f.duration || 0;
                groups[key].totalCalories += window.gpxUtils.calculateCalories(f.distance, this.userWeight);
                groups[key].runCount++;
            });

            // Calculate averages for groups
            Object.values(groups).forEach(g => {
                g.avgPace = g.totalDistance > 0 ? (g.totalDuration / 1000 / 60) / g.totalDistance : 0;
                g.totalCalories = Math.round(g.totalCalories);
                // We keep files in the group sorted newest to oldest because savedFiles is already sorted
            });

            const groupList = Object.values(groups);
            // Default first group to expanded to prevent test failures
            if (groupList.length > 0) {
                groupList[0].expanded = true;
            }
            this.groupedFiles = groupList;
        },

        updateCityMetadata(id, city) {
            // Update in savedFiles
            const file = this.savedFiles.find(f => f.id === id);
            if (file) {
                file.city = city;
            }

            // Update in groupedFiles
            for (const group of this.groupedFiles) {
                const groupFile = group.files.find(f => f.id === id);
                if (groupFile) {
                    groupFile.city = city;
                    break;
                }
            }

            // Update activeGpx if it matches
            if (this.activeGpx && this.activeGpx.id === id) {
                this.activeGpx.city = city;
                this.activeGpxStats.location = city;
            }
        }
    });
});
