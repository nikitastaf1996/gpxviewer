import React, { useEffect, useRef, useState } from 'react';
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
  Filler,
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

const ChartsSidebar = ({ isOpen, isFullscreen, onClose, onToggleFullscreen, data, points }) => {
  const [splits, setSplits] = useState([]);
  const [climbs, setClimbs] = useState([]);

  useEffect(() => {
    if (data.length > 0 && points.length > 0) {
      // Process Splits
      const newSplits = [];
      const splitDist = 1.0;
      let nextSplit = splitDist;
      let splitStartDist = 0;
      let splitStartTime = points[0].time;

      for (let i = 0; i < data.length; i++) {
        if (data[i].dist >= nextSplit || i === data.length - 1) {
          const dDist = data[i].dist - splitStartDist;
          const dTime = (points[i].time - splitStartTime) / 1000 / 60;
          if (dDist > 0.1) {
            newSplits.push({
              label: `Split ${newSplits.length + 1}`,
              pace: dTime / dDist,
            });
          }
          splitStartDist = data[i].dist;
          splitStartTime = points[i].time;
          nextSplit += splitDist;
        }
      }
      setSplits(newSplits);

      // Process Climbs
      const newClimbs = [];
      let currentClimb = null;
      const minGain = 5;
      const minDistance = 100;

      for (let i = 1; i < data.length; i++) {
        const eleDiff = data[i].ele - data[i - 1].ele;
        const distDiff = (data[i].dist - data[i - 1].dist) * 1000;

        if (eleDiff > 0) {
          if (!currentClimb) {
            currentClimb = { startIdx: i - 1, gain: 0, dist: 0, paces: [] };
          }
          currentClimb.gain += eleDiff;
          currentClimb.dist += distDiff;
          if (data[i].smoothedPace > 0) currentClimb.paces.push(data[i].smoothedPace);
        } else if (currentClimb) {
          if (currentClimb.gain >= minGain && currentClimb.dist >= minDistance) {
            currentClimb.avgPace =
              currentClimb.paces.reduce((a, b) => a + b, 0) / currentClimb.paces.length;
            newClimbs.push(currentClimb);
          }
          currentClimb = null;
        }
      }
      if (currentClimb && currentClimb.gain >= minGain && currentClimb.dist >= minDistance) {
        currentClimb.avgPace =
          currentClimb.paces.reduce((a, b) => a + b, 0) / currentClimb.paces.length;
        newClimbs.push(currentClimb);
      }
      setClimbs(newClimbs);
    }
  }, [data, points]);

  const elevationData = {
    datasets: [
      {
        label: 'Elevation (m)',
        data: data.map((d) => ({ x: d.dist, y: d.ele })),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: true,
        pointRadius: 0,
        tension: 0.1,
      },
    ],
  };

  const paceData = {
    datasets: [
      {
        label: 'Pace (min/km)',
        data: data.map((d) => ({
          x: d.dist,
          y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null,
        })),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: 'GAP (min/km)',
        data: data.map((d) => ({
          x: d.dist,
          y: d.smoothedGap > 0 && d.smoothedGap < 20 ? d.smoothedGap : null,
        })),
        borderColor: 'rgba(255, 159, 64, 0.5)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  };

  const comboData = {
    datasets: [
      {
        label: 'Elevation (m)',
        data: data.map((d) => ({ x: d.dist, y: d.ele })),
        borderColor: 'rgb(75, 192, 192)',
        yAxisID: 'y-ele',
        fill: false,
        pointRadius: 0,
      },
      {
        label: 'Pace (min/km)',
        data: data.map((d) => ({
          x: d.dist,
          y: d.smoothedPace > 0 && d.smoothedPace < 20 ? d.smoothedPace : null,
        })),
        borderColor: 'rgb(255, 99, 132)',
        yAxisID: 'y-pace',
        fill: false,
        pointRadius: 0,
      },
    ],
  };

  const avgPace = splits.length > 0 ? splits.reduce((a, b) => a + b.pace, 0) / splits.length : 0;
  const splitsChartData = {
    labels: splits.map((s) => s.label),
    datasets: [
      {
        label: 'Split Pace (min/km)',
        data: splits.map((s) => s.pace),
        backgroundColor: splits.map((s) =>
          s.pace <= avgPace ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)'
        ),
      },
    ],
  };

  const climbChartData = {
    labels: climbs.map((_, i) => `Climb #${i + 1}`),
    datasets: [
      {
        label: 'Avg Pace on Climb (min/km)',
        data: climbs.map((c) => c.avgPace),
        backgroundColor: 'rgba(153, 102, 255, 0.6)',
      },
    ],
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
  };

  return (
    <div className={`sidebar-right ${isOpen ? 'active' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="sidebar-header">
        <h3>Charts & Analysis</h3>
        <div className="header-actions">
          <button className="action-btn" onClick={onToggleFullscreen} aria-label="Fullscreen Charts">
            ⛶
          </button>
          <button className="close-sidebar" onClick={onClose} aria-label="Close Charts">
            &times;
          </button>
        </div>
      </div>
      <div id="charts-container">
        <div className="chart-wrapper">
          <Line
            data={elevationData}
            options={{
              ...commonOptions,
              plugins: { title: { display: true, text: 'Elevation Profile' } },
              scales: {
                x: { type: 'linear', title: { display: true, text: 'Distance (km)' } },
                y: { title: { display: true, text: 'Elevation (m)' } },
              },
            }}
          />
        </div>
        <div className="chart-wrapper">
          <Line
            data={paceData}
            options={{
              ...commonOptions,
              plugins: { title: { display: true, text: 'Pace & Grade Adjusted Pace' } },
              scales: {
                x: { type: 'linear', title: { display: true, text: 'Distance (km)' } },
                y: {
                  reverse: true,
                  title: { display: true, text: 'Pace (min/km)' },
                  suggestedMin: 3,
                  suggestedMax: 10,
                },
              },
            }}
          />
        </div>
        <div className="chart-wrapper">
          <Line
            data={comboData}
            options={{
              ...commonOptions,
              plugins: { title: { display: true, text: 'Elevation & Pace (Synchronized)' } },
              scales: {
                x: { type: 'linear', title: { display: true, text: 'Distance (km)' } },
                'y-ele': {
                  type: 'linear',
                  display: true,
                  position: 'left',
                  title: { display: true, text: 'Elevation (m)' },
                },
                'y-pace': {
                  type: 'linear',
                  display: true,
                  position: 'right',
                  reverse: true,
                  title: { display: true, text: 'Pace (min/km)' },
                  grid: { drawOnChartArea: false },
                  suggestedMin: 3,
                  suggestedMax: 10,
                },
              },
            }}
          />
        </div>
        <div className="chart-wrapper">
          <Bar
            data={climbChartData}
            options={{
              ...commonOptions,
              plugins: { title: { display: true, text: 'Hill Consistency Matrix' } },
              scales: { y: { reverse: true, title: { display: true, text: 'Avg Pace (min/km)' } } },
            }}
          />
        </div>
        <div className="chart-wrapper">
          <Bar
            data={splitsChartData}
            options={{
              ...commonOptions,
              plugins: { title: { display: true, text: 'Split Performance (1km)' } },
              scales: { y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } } },
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ChartsSidebar;
