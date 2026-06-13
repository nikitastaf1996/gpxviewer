import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ChartsContainer = ({ data, points }) => {
    const elevationData = useMemo(() => {
        if (!data) return null;
        const eleValues = data.map(d => d.ele);
        const minEle = Math.min(...eleValues);
        const maxEle = Math.max(...eleValues);

        return {
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
        };
    }, [data]);

    const paceData = useMemo(() => {
        if (!data) return null;
        return {
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
        };
    }, [data]);

    const comboData = useMemo(() => {
        if (!data) return null;
        return {
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
        };
    }, [data]);

    const climbs = useMemo(() => {
        if (!data) return [];
        const foundClimbs = [];
        let currentClimb = null;
        const minGain = 5;
        const minDistance = 100;

        for (let i = 1; i < data.length; i++) {
            const eleDiff = data[i].ele - data[i-1].ele;
            const distDiff = (data[i].dist - data[i-1].dist) * 1000;

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
                    foundClimbs.push(currentClimb);
                }
                currentClimb = null;
            }
        }
        return foundClimbs;
    }, [data]);

    const climbChartData = {
        labels: climbs.map((_, i) => "Climb #" + (i + 1)),
        datasets: [{
            label: 'Avg Pace on Climb (min/km)',
            data: climbs.map(c => c.avgPace),
            backgroundColor: 'rgba(153, 102, 255, 0.6)'
        }]
    };

    const splits = useMemo(() => {
        if (!data || !points) return [];
        const foundSplits = [];
        const splitDist = 1.0;
        let nextSplit = splitDist;
        let splitStartDist = 0;
        let splitStartTime = points[0].time;

        for (let i = 0; i < data.length; i++) {
            if (data[i].dist >= nextSplit || i === data.length - 1) {
                const dDist = data[i].dist - splitStartDist;
                const dTime = (points[i].time - splitStartTime) / 1000 / 60;
                if (dDist > 0.1) {
                    foundSplits.push({
                        label: "Split " + (foundSplits.length + 1),
                        pace: dTime / dDist
                    });
                }
                splitStartDist = data[i].dist;
                splitStartTime = points[i].time;
                nextSplit += splitDist;
            }
        }
        return foundSplits;
    }, [data, points]);

    const splitChartData = useMemo(() => {
        if (splits.length === 0) return null;
        const avgPace = splits.reduce((a, b) => a + b.pace, 0) / splits.length;
        return {
            labels: splits.map(s => s.label),
            datasets: [{
                label: 'Split Pace (min/km)',
                data: splits.map(s => s.pace),
                backgroundColor: splits.map(s => s.pace <= avgPace ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)')
            }]
        };
    }, [splits]);

    if (!data) return <div id="charts-container">No data to display</div>;

    return (
        <div id="charts-container">
            <div className="chart-wrapper">
                <Line
                    data={elevationData}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { type: "linear", title: { display: true, text: 'Distance (km)' } },
                            y: { title: { display: true, text: 'Elevation (m)' } }
                        },
                        plugins: { title: { display: true, text: 'Elevation Profile' } }
                    }}
                />
            </div>
            <div className="chart-wrapper">
                <Line
                    data={paceData}
                    options={{
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
                    }}
                />
            </div>
            <div className="chart-wrapper">
                <Line
                    data={comboData}
                    options={{
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
                        plugins: { title: { display: true, text: 'Elevation & Pace (Synchronized)' } }
                    }}
                />
            </div>
            <div className="chart-wrapper">
                <Bar
                    data={climbChartData}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { title: { display: true, text: 'Hill Consistency Matrix' } },
                        scales: { y: { reverse: true, title: { display: true, text: 'Avg Pace (min/km)' } } }
                    }}
                />
            </div>
            {splitChartData && (
                <div className="chart-wrapper">
                    <Bar
                        data={splitChartData}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { title: { display: true, text: 'Split Performance (1km)' } },
                            scales: { y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } } }
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default ChartsContainer;
