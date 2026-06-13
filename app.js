var map = L.map('map', {
    fullscreenControl: true
}).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

var currentTrack;
var charts = {};
var currentSettings = {
    elevation: true,
    pace: true,
    combo: true,
    climb: true,
    splits: true
};

// --- Tab Navigation ---
function showTab(tabId) {
    // Update tab content visibility
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');

    // Update bottom nav button state
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    const navId = 'nav-' + tabId.replace('tab-', '');
    const activeNav = document.getElementById(navId);
    if (activeNav) activeNav.classList.add('active');

    // Trigger map and chart resize if showing Analyze tab
    if (tabId === 'tab-analyze') {
        setTimeout(() => {
            map.invalidateSize();
            Object.values(charts).forEach(chart => chart.resize());
        }, 100);
    }
}

// --- Settings Management ---
function loadSettings() {
    const saved = localStorage.getItem('gpxViewerSettings');
    if (saved) {
        currentSettings = JSON.parse(saved);
    }

    // Update toggle inputs in DOM
    for (const key in currentSettings) {
        const input = document.getElementById('toggle-' + key);
        if (input) input.checked = currentSettings[key];
    }
    applySettings();
}

function saveSettings() {
    for (const key in currentSettings) {
        const input = document.getElementById('toggle-' + key);
        if (input) currentSettings[key] = input.checked;
    }
    localStorage.setItem('gpxViewerSettings', JSON.stringify(currentSettings));
    applySettings();
}

function applySettings() {
    for (const key in currentSettings) {
        const wrapper = document.getElementById('wrapper-' + key);
        if (wrapper) {
            wrapper.style.display = currentSettings[key] ? 'block' : 'none';
        }
    }
    // Resize remaining charts
    Object.values(charts).forEach(chart => chart.resize());
}

// --- GPX Handling ---
document.getElementById('gpx-file').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        var gpxData = e.target.result;
        saveGpx(file.name, gpxData);
        displayGpx(gpxData);
    };
    reader.readAsText(file);
});

function saveGpx(name, data) {
    var savedFiles = JSON.parse(localStorage.getItem('gpxFiles') || '{}');
    savedFiles[name] = data;
    localStorage.setItem('gpxFiles', JSON.stringify(savedFiles));
    renderLibrary();
}

function loadSavedGpxList() {
    return JSON.parse(localStorage.getItem('gpxFiles') || '{}');
}

function deleteGpx(name) {
    var savedFiles = JSON.parse(localStorage.getItem('gpxFiles') || '{}');
    delete savedFiles[name];
    localStorage.setItem('gpxFiles', JSON.stringify(savedFiles));
    renderLibrary();
}

function renderLibrary() {
    var savedFiles = loadSavedGpxList();
    var savedList = document.getElementById('saved-list');
    if (!savedList) return;

    savedList.innerHTML = '';

    Object.keys(savedFiles).forEach(function(name) {
        var item = document.createElement('div');
        item.className = 'sidebar-item';

        var span = document.createElement('span');
        span.textContent = name;
        span.onclick = function() {
            displayGpx(savedFiles[name]);
        };

        var btn = document.createElement('button');
        btn.textContent = 'Delete';
        btn.className = 'delete-btn';
        btn.onclick = function(e) {
            e.stopPropagation();
            deleteGpx(name);
        };

        item.appendChild(span);
        item.appendChild(btn);
        savedList.appendChild(item);
    });
}

function displayGpx(gpxData) {
    // UI Transitions
    document.getElementById('analyze-fallback').style.display = 'none';
    document.getElementById('analyze-data').style.display = 'flex';
    showTab('tab-analyze');

    if (currentTrack) {
        map.removeLayer(currentTrack);
    }

    currentTrack = new L.GPX(gpxData, {
        async: true,
        marker_options: {
            startIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
            endIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
            shadowUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png'
        }
    }).on('loaded', function(e) {
        var gpx = e.target;
        map.fitBounds(gpx.getBounds());

        // Distance in km
        var distKm = gpx.get_distance() / 1000;
        document.getElementById('distance').textContent = distKm.toFixed(2) + " km";

        // Duration
        var durationMs = gpx.get_total_time();
        document.getElementById('duration').textContent = formatDuration(durationMs);

        // Pace (min/km)
        if (distKm > 0) {
            var paceMinPerKm = (durationMs / 1000 / 60) / distKm;
            document.getElementById('pace').textContent = formatPace(paceMinPerKm);
        } else {
            document.getElementById('pace').textContent = "-";
        }

        // Elevation
        document.getElementById('elevation-gain').textContent = gpx.get_elevation_gain().toFixed(0) + " m";
        document.getElementById('elevation-loss').textContent = gpx.get_elevation_loss().toFixed(0) + " m";

        processGpxData(gpxData);
    }).addTo(map);
}

function processGpxData(gpxXml) {
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(gpxXml, "text/xml");
    var trkpts = xmlDoc.getElementsByTagName("trkpt");

    var points = [];
    var totalDist = 0;

    for (var i = 0; i < trkpts.length; i++) {
        var pt = trkpts[i];
        var lat = parseFloat(pt.getAttribute("lat"));
        var lon = parseFloat(pt.getAttribute("lon"));
        var ele = pt.getElementsByTagName("ele")[0] ? parseFloat(pt.getElementsByTagName("ele")[0].textContent) : null;
        var time = pt.getElementsByTagName("time")[0] ? new Date(pt.getElementsByTagName("time")[0].textContent) : null;

        var hdop = pt.getElementsByTagName("hdop")[0] ? parseFloat(pt.getElementsByTagName("hdop")[0].textContent) : null;
        if (!hdop) {
            var extensions = pt.getElementsByTagName("extensions")[0];
            if (extensions) {
                hdop = extensions.getElementsByTagName("hdop")[0] ? parseFloat(extensions.getElementsByTagName("hdop")[0].textContent) : null;
            }
        }

        if (i > 0) {
            var prevPt = points[i-1];
            totalDist += calculateDistance(prevPt.lat, prevPt.lon, lat, lon);
        }

        points.push({
            lat: lat,
            lon: lon,
            ele: ele,
            time: time,
            dist: totalDist,
            hdop: hdop
        });
    }

    // Generate metrics for charts
    var processedData = calculateMetrics(points);
    generateCharts(processedData, points);
}

function calculateMetrics(points) {
    var windowSize = 10; // 10 points SMA
    var metrics = [];

    for (var i = 0; i < points.length; i++) {
        var pace = 0;
        var gap = 0;

        if (i > 0) {
            var dt = (points[i].time - points[i-1].time) / 1000; // seconds
            var dd = points[i].dist - points[i-1].dist; // meters

            if (dt > 0 && dd > 0) {
                pace = (dt / 60) / (dd / 1000); // min/km

                // Grade Adjusted Pace (Minetti formula)
                var grade = (points[i].ele - points[i-1].ele) / dd;
                var c = grade;
                var ratio = 1 + 9*c*c + (c > 0 ? 3*c : 2*c);
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

    // Apply SMA smoothing
    for (var i = 0; i < metrics.length; i++) {
        var start = Math.max(0, i - Math.floor(windowSize / 2));
        var end = Math.min(metrics.length - 1, i + Math.floor(windowSize / 2));
        var sumPace = 0, sumGap = 0, count = 0;
        for (var j = start; j <= end; j++) {
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
}

function generateCharts(data, points) {
    createElevationChart(data);
    createPaceChart(data);
    createComboChart(data);
    createClimbChart(data);
    createSplitsChart(data, points);
    applySettings(); // Ensure visibility is correct after creation
}

function createElevationChart(data) {
    if (charts.elevation) charts.elevation.destroy();
    var ctx = document.getElementById('elevation-chart').getContext('2d');
    var eleData = data.map(d => d.ele);
    var minEle = Math.min(...eleData);
    var maxEle = Math.max(...eleData);

    charts.elevation = new Chart(ctx, {
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
}

function createPaceChart(data) {
    if (charts.pace) charts.pace.destroy();
    var ctx = document.getElementById('pace-chart').getContext('2d');
    charts.pace = new Chart(ctx, {
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
}

function createComboChart(data) {
    if (charts.combo) charts.combo.destroy();
    var ctx = document.getElementById('combo-chart').getContext('2d');
    charts.combo = new Chart(ctx, {
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
}

function createClimbChart(data) {
    if (charts.climb) charts.climb.destroy();
    var climbs = [];
    var currentClimb = null;
    var minGain = 5, minDistance = 100;

    for (var i = 1; i < data.length; i++) {
        var eleDiff = data[i].ele - data[i-1].ele;
        var distDiff = (data[i].dist - data[i-1].dist) * 1000;

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

    var ctx = document.getElementById('climb-chart').getContext('2d');
    charts.climb = new Chart(ctx, {
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
}

function createSplitsChart(data, points) {
    if (charts.splits) charts.splits.destroy();
    var splits = [];
    var splitDist = 1.0, nextSplit = splitDist, splitStartDist = 0, splitStartTime = points[0].time;

    for (var i = 0; i < data.length; i++) {
        if (data[i].dist >= nextSplit || i === data.length - 1) {
            var dDist = data[i].dist - splitStartDist;
            var dTime = (points[i].time - splitStartTime) / 1000 / 60;
            if (dDist > 0.1) splits.push({ label: "Split " + (splits.length + 1), pace: dTime / dDist });
            splitStartDist = data[i].dist;
            splitStartTime = points[i].time;
            nextSplit += splitDist;
        }
    }
    if (splits.length === 0) return;

    var avgPace = splits.reduce((a, b) => a + b.pace, 0) / splits.length;
    var ctx = document.getElementById('splits-chart').getContext('2d');
    charts.splits = new Chart(ctx, {
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
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371e3;
    var φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    var Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDuration(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600);
    s %= 3600; var m = Math.floor(s / 60); s %= 60;
    return (h > 0 ? h + "h " : "") + m + "m " + s + "s";
}

function formatPace(minPerKm) {
    var min = Math.floor(minPerKm), sec = Math.round((minPerKm - min) * 60);
    if (sec === 60) { min++; sec = 0; }
    return min + ":" + (sec < 10 ? "0" : "") + sec + " /km";
}

// --- Initial Setup ---
window.addEventListener('load', () => {
    renderLibrary();
    loadSettings();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed:', err));
    }
});
