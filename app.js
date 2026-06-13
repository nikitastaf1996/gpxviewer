var map = L.map('map', {
    fullscreenControl: true
}).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

var currentTrack;

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
    renderSidebar();
}

function loadSavedGpxList() {
    return JSON.parse(localStorage.getItem('gpxFiles') || '{}');
}

function deleteGpx(name) {
    var savedFiles = JSON.parse(localStorage.getItem('gpxFiles') || '{}');
    delete savedFiles[name];
    localStorage.setItem('gpxFiles', JSON.stringify(savedFiles));
    renderSidebar();
}

function createPaceChart(data) {
    if (charts.pace) charts.pace.destroy();

    var ctx = document.getElementById('pace-chart').getContext('2d');

    // For precision ribbon

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
                    tension: 0.3,
                    z: 10
                },
                {
                    label: 'GAP (min/km)',
                    data: data.map(d => ({x: d.dist, y: d.smoothedGap > 0 && d.smoothedGap < 20 ? d.smoothedGap : null})),
                    borderColor: 'rgba(255, 159, 64, 0.5)',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    z: 5
                },
                {
                    label: 'Uncertainty',
                    data: data.map(d => ({x: d.dist, y: (d.smoothedPace > 0 && d.hdop) ? d.smoothedPace + d.hdop * 0.1 : null})),
                    fill: '+1',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderColor: 'transparent',
                    pointRadius: 0,
                    tension: 0.3
                },
                {
                    label: 'Uncertainty Lower',
                    data: data.map(d => ({x: d.dist, y: (d.smoothedPace > 0 && d.hdop) ? Math.max(0, d.smoothedPace - d.hdop * 0.1) : null})),
                    fill: false,
                    borderColor: 'transparent',
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
                y: {
                    reverse: true,
                    title: { display: true, text: 'Pace (min/km)' },
                    suggestedMin: 3,
                    suggestedMax: 10
                }
            },
            plugins: {
                title: { display: true, text: 'Pace & Grade Adjusted Pace' },
                legend: {
                    labels: {
                        filter: (item) => !item.text.includes('Uncertainty Lower')
                    }
                }
            }
        }
    });
}

function createSplitsChart(data, points) {
    if (charts.splits) charts.splits.destroy();

    var splits = [];
    var splitDist = 1.0; // 1 km
    var nextSplit = splitDist;
    var splitStartDist = 0;
    var splitStartTime = points[0].time;

    for (var i = 0; i < data.length; i++) {
        if (data[i].dist >= nextSplit || i === data.length - 1) {
            var dDist = data[i].dist - splitStartDist;
            var dTime = (data[i].time - splitStartTime) / 1000 / 60; // min
            if (dDist > 0.1) { // Avoid tiny splits at the end
                splits.push({
                    label: "Split " + (splits.length + 1),
                    pace: dTime / dDist
                });
            }
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
            datasets: [{
                label: 'Split Pace (min/km)',
                data: splits.map(s => s.pace),
                backgroundColor: splits.map(s => s.pace <= avgPace ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Split Performance (1km)' }
            },
            scales: {
                y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } }
            }
        }
    });
}

function createClimbChart(data) {
    if (charts.climb) charts.climb.destroy();

    var climbs = [];
    var currentClimb = null;
    var minGain = 5; // meters
    var minDistance = 100; // meters

    for (var i = 1; i < data.length; i++) {
        var eleDiff = data[i].ele - data[i-1].ele;
        var distDiff = (data[i].dist - data[i-1].dist) * 1000;

        if (eleDiff > 0) {
            if (!currentClimb) {
                currentClimb = { startIdx: i-1, gain: 0, dist: 0, paces: [] };
            }
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
    if (currentClimb && currentClimb.gain >= minGain && currentClimb.dist >= minDistance) {
        currentClimb.avgPace = currentClimb.paces.reduce((a, b) => a + b, 0) / currentClimb.paces.length;
        climbs.push(currentClimb);
    }

    var ctx = document.getElementById('climb-chart').getContext('2d');
    charts.climb = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: climbs.map((_, i) => "Climb #" + (i + 1)),
            datasets: [{
                label: 'Avg Pace on Climb (min/km)',
                data: climbs.map(c => c.avgPace),
                backgroundColor: 'rgba(153, 102, 255, 0.6)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Hill Consistency Matrix (Climb Performance)' }
            },
            scales: {
                y: { reverse: true, title: { display: true, text: 'Avg Pace (min/km)' } }
            }
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
                'y-ele': {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Elevation (m)' }
                },
                'y-pace': {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    reverse: true,
                    title: { display: true, text: 'Pace (min/km)' },
                    grid: { drawOnChartArea: false },
                    suggestedMin: 3,
                    suggestedMax: 10
                }
            },
            plugins: {
                title: { display: true, text: 'Elevation & Pace (Synchronized)' }
            }
        }
    });
}

function renderSidebar() {
    var savedFiles = loadSavedGpxList();
    var savedList = document.getElementById('saved-list');
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

var sidebar = document.getElementById('sidebar');
var overlay = document.getElementById('sidebar-overlay');
var menuToggleBtn = document.getElementById('menu-toggle');

function toggleSidebar() {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);

// Initial render
renderSidebar();

function displayGpx(gpxData) {
    // Close sidebar on mobile/drawer mode when a file is selected
    if (sidebar.classList.contains('active')) {
        toggleSidebar();
    }

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

    console.log("Extracted points:", points.length);
    console.log("Sample point:", points[0]);

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
                // Minetti et al. (2002) simpler approximation or similar:
                // Cr = 155.4 * i^5 - 30.4 * i^4 - 43.3 * i^3 + 46.3 * i^2 + 19.5 * i + 3.6
                // We'll use a standard running cost factor approximation:
                var c = grade;
                var ratio = 1 + 9*c*c + (c > 0 ? 3*c : 2*c); // Simplified Minetti-like
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

    // Apply SMA smoothing to pace and gap
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

var charts = {};

function generateCharts(data, points) {
    console.log("Generating charts with data points:", data.length);

    createElevationChart(data);
    if (typeof createPaceChart === 'function') createPaceChart(data);
    if (typeof createComboChart === 'function') createComboChart(data);
    if (typeof createClimbChart === 'function') createClimbChart(data);
    if (typeof createSplitsChart === 'function') createSplitsChart(data, points);
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
            plugins: {
                title: { display: true, text: 'Elevation Profile' }
            }
        }
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371e3; // metres
    var φ1 = lat1 * Math.PI/180;
    var φ2 = lat2 * Math.PI/180;
    var Δφ = (lat2-lat1) * Math.PI/180;
    var Δλ = (lon2-lon1) * Math.PI/180;

    var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

function formatDuration(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    s %= 3600;
    var m = Math.floor(s / 60);
    s %= 60;

    var res = "";
    if (h > 0) res += h + "h ";
    res += m + "m " + s + "s";
    return res;
}

function formatPace(minPerKm) {
    var min = Math.floor(minPerKm);
    var sec = Math.round((minPerKm - min) * 60);
    if (sec === 60) {
        min++;
        sec = 0;
    }
    return min + ":" + (sec < 10 ? "0" : "") + sec + " /km";
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, (err) => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
