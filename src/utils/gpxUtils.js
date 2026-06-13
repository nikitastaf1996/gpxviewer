export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

export function formatDuration(ms) {
    let s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;

    let res = "";
    if (h > 0) res += h + "h ";
    res += m + "m " + s + "s";
    return res;
}

export function formatPace(minPerKm) {
    let min = Math.floor(minPerKm);
    let sec = Math.round((minPerKm - min) * 60);
    if (sec === 60) {
        min++;
        sec = 0;
    }
    return `${min}:${sec < 10 ? "0" : ""}${sec} /km`;
}

export function processGpxData(gpxXml) {
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
            totalDist += calculateDistance(prevPt.lat, prevPt.lon, lat, lon);
        }

        points.push({
            lat,
            lon,
            ele,
            time,
            dist: totalDist,
            hdop
        });
    }

    return {
        points,
        metrics: calculateMetrics(points)
    };
}

function calculateMetrics(points) {
    const windowSize = 10; // 10 points SMA
    const metrics = [];

    for (let i = 0; i < points.length; i++) {
        let pace = 0;
        let gap = 0;

        if (i > 0) {
            const dt = (points[i].time - points[i-1].time) / 1000; // seconds
            const dd = points[i].dist - points[i-1].dist; // meters

            if (dt > 0 && dd > 0) {
                pace = (dt / 60) / (dd / 1000); // min/km

                const grade = (points[i].ele - points[i-1].ele) / dd;
                const c = grade;
                const ratio = 1 + 9*c*c + (c > 0 ? 3*c : 2*c);
                gap = pace / ratio;
            }
        }

        metrics.push({
            dist: points[i].dist / 1000,
            ele: points[i].ele,
            pace,
            gap,
            hdop: points[i].hdop
        });
    }

    // Apply SMA smoothing
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
}
