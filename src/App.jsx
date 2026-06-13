import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import StatsBar from './components/StatsBar';
import Sidebar from './components/Sidebar';
import ChartsSidebar from './components/ChartsSidebar';
import MapComponent from './components/MapComponent';
import { loadSavedGpxList, saveGpx, deleteGpx } from './utils/storageUtils';
import { formatDuration, formatPace, calculateMetrics, parseGpxXml } from './utils/gpxUtils';
import './App.css';

function App() {
  const [savedFiles, setSavedFiles] = useState({});
  const [currentGpxData, setCurrentGpxData] = useState(null);
  const [processedData, setProcessedData] = useState([]);
  const [rawPoints, setRawPoints] = useState([]);
  const [stats, setStats] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [isChartsFullscreen, setIsChartsFullscreen] = useState(false);

  useEffect(() => {
    setSavedFiles(loadSavedGpxList());
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const gpxData = e.target.result;
      const updatedFiles = saveGpx(file.name, gpxData);
      setSavedFiles(updatedFiles);
      setCurrentGpxData(gpxData);
      setIsSidebarOpen(false);
    };
    reader.readAsText(file);
  };

  const handleSelectTrack = (name) => {
    const gpxData = savedFiles[name];
    setCurrentGpxData(gpxData);
    setIsSidebarOpen(false);
  };

  const handleDeleteTrack = (name) => {
    const updatedFiles = deleteGpx(name);
    setSavedFiles(updatedFiles);
  };

  const handleMapLoaded = (gpx) => {
    const distKm = gpx.get_distance() / 1000;
    const durationMs = gpx.get_total_time();
    const paceMinPerKm = distKm > 0 ? (durationMs / 1000 / 60) / distKm : 0;

    setStats({
      distance: distKm.toFixed(2) + " km",
      duration: formatDuration(durationMs),
      pace: formatPace(paceMinPerKm),
      gain: gpx.get_elevation_gain().toFixed(0) + " m",
      loss: gpx.get_elevation_loss().toFixed(0) + " m",
    });

    const points = parseGpxXml(currentGpxData);
    setRawPoints(points);
    const metrics = calculateMetrics(points);
    setProcessedData(metrics);
  };

  return (
    <div id="root">
      <Header
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onToggleCharts={() => {
          setIsChartsOpen(!isChartsOpen);
          if (isChartsOpen) setIsChartsFullscreen(false);
        }}
      />

      <div id="controls">
        <input type="file" id="gpx-file" accept=".gpx" onChange={handleFileUpload} />
      </div>

      <StatsBar stats={stats} />

      <div id="container">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          savedFiles={savedFiles}
          onSelect={handleSelectTrack}
          onDelete={handleDeleteTrack}
        />

        <ChartsSidebar
          isOpen={isChartsOpen}
          isFullscreen={isChartsFullscreen}
          onClose={() => {
            setIsChartsOpen(false);
            setIsChartsFullscreen(false);
          }}
          onToggleFullscreen={() => setIsChartsFullscreen(!isChartsFullscreen)}
          data={processedData}
          points={rawPoints}
        />

        <div id="sidebar-overlay"
          className={isSidebarOpen || isChartsOpen ? 'active' : ''}
          onClick={() => {
            setIsSidebarOpen(false);
            setIsChartsOpen(false);
            setIsChartsFullscreen(false);
          }}
        />

        <div id="main-content">
          <MapComponent gpxData={currentGpxData} onLoaded={handleMapLoaded} />
        </div>
      </div>
    </div>
  );
}

export default App;
