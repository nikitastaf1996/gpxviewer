window.gpxUtils = {
    // Approximate calories burned per km per kg of body weight.
    // Derived from the standard running METs approximation.
    CALORIES_PER_KM_PER_KG: 1.036,

    // Paces above this value (min/km) are treated as GPS noise — e.g., the
    // runner stopped, walked, or signal was lost. They are excluded from
    // charted pace/GAP series and from pace averages.
    MAX_VALID_PACE_MIN_PER_KM: 20,

    // Two consecutive trackpoints spaced further apart than this (in ms) are
    // treated as a pause (traffic light, water break, GPS dropout). Their
    // elapsed time is excluded from "moving time" but kept in "total time".
    // Value mirrors Leaflet.GPX's _MAX_POINT_INTERVAL_MS so the library card
    // and the analyse tab agree on what counts as moving.
    MAX_POINT_INTERVAL_MS: 15000,

    calculateCalories(distKm, weightKg) {
        return Math.round((distKm || 0) * (weightKg || 70) * this.CALORIES_PER_KM_PER_KG);
    },

    isValidPace(paceMinPerKm) {
        return paceMinPerKm > 0 && paceMinPerKm < this.MAX_VALID_PACE_MIN_PER_KM;
    },
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    // 3D distance between two points: 2D Haversine combined with the
    // elevation delta. This MUST match Leaflet.GPX's _dist3d, otherwise the
    // library card (which uses parseGpxMetadata) and the analyse tab (which
    // uses gpx.get_distance()) drift apart on hilly runs.
    calculateDistance3D(lat1, lon1, ele1, lat2, lon2, ele2) {
        const d2 = this.calculateDistance(lat1, lon1, lat2, lon2);
        const dEle = Math.abs((ele2 || 0) - (ele1 || 0));
        return Math.sqrt(d2 * d2 + dEle * dEle);
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

    parseGpxMetadata(gpxXml) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(gpxXml, "text/xml");
        const trkpts = xmlDoc.getElementsByTagName("trkpt");

        if (trkpts.length === 0) return null;

        const firstPt = trkpts[0];
        const lastPt = trkpts[trkpts.length - 1];

        const startTime = firstPt.getElementsByTagName("time")[0] ? new Date(firstPt.getElementsByTagName("time")[0].textContent) : new Date();
        const endTime = lastPt.getElementsByTagName("time")[0] ? new Date(lastPt.getElementsByTagName("time")[0].textContent) : startTime;

        // IMPORTANT: distance and time are accumulated the same way Leaflet.GPX
        // does it in its _parse_segment, so that the library card / lifetime
        // stats (which read from this metadata) and the analyse tab (which
        // reads from gpx.get_distance() / gpx.get_total_time()) stay in sync.
        //
        //   - Distance: 3D distance (2D Haversine + elevation delta), matching
        //     Leaflet.GPX._dist3d.
        //   - Total time: sum of |time[i] - time[i-1]|, matching
        //     Leaflet.GPX._info.duration.total.
        //   - Moving time: sum of |Δt| for intervals shorter than
        //     MAX_POINT_INTERVAL_MS, matching Leaflet.GPX._info.duration.moving.
        let totalDist = 0;
        let totalTimeMs = 0;
        let movingTimeMs = 0;
        let prev = null;

        for (let i = 0; i < trkpts.length; i++) {
            const pt = trkpts[i];
            const lat = parseFloat(pt.getAttribute("lat"));
            const lon = parseFloat(pt.getAttribute("lon"));
            const eleNode = pt.getElementsByTagName("ele")[0];
            const ele = eleNode ? parseFloat(eleNode.textContent) : null;
            const timeNode = pt.getElementsByTagName("time")[0];
            const time = timeNode ? new Date(timeNode.textContent) : null;

            if (prev && prev.time && time) {
                const dt = Math.abs(time - prev.time);
                totalDist += this.calculateDistance3D(prev.lat, prev.lon, prev.ele, lat, lon, ele);
                totalTimeMs += dt;
                if (dt < this.MAX_POINT_INTERVAL_MS) {
                    movingTimeMs += dt;
                }
            }
            prev = { lat, lon, ele, time };
        }

        const distKm = totalDist / 1000;
        const durationMs = totalTimeMs;
        const paceMinPerKm = distKm > 0 ? (durationMs / 1000 / 60) / distKm : 0;
        const movingPaceMinPerKm = distKm > 0 ? (movingTimeMs / 1000 / 60) / distKm : 0;

        return {
            date: startTime,
            distance: distKm,
            duration: durationMs,
            movingTime: movingTimeMs,
            avgPace: paceMinPerKm,
            movingPace: movingPaceMinPerKm,
            lat: parseFloat(firstPt.getAttribute("lat")),
            lon: parseFloat(firstPt.getAttribute("lon"))
        };
    },

    async fetchCityName(lat, lon, preferredEntity = 'city') {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            const address = data.address;
            if (!address) return '';

            // Try preferred first
            if (address[preferredEntity]) return address[preferredEntity];

            // Fallback sequence
            const fallbacks = ['city', 'town', 'village', 'suburb', 'municipality', 'county', 'district', 'state'];
            for (const key of fallbacks) {
                if (address[key]) return address[key];
            }
            return '';
        } catch (error) {
            console.error('Reverse geocoding failed:', error);
            return '';
        }
    },

    processGpxPoints(gpxXml) {
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
        return points;
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
    }
};
