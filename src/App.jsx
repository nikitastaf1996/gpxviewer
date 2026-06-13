import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import StatsBar from './components/StatsBar';
import Sidebar from './components/Sidebar';
import ChartsSidebar from './components/ChartsSidebar';
import MapComponent from './components/MapComponent';
import { processGpxData, formatDuration, formatPace } from './utils/gpxUtils';
import { getSavedFiles, saveFile, deleteFile } from './utils/storageUtils';
import './App.css';

function App() {
    const [savedFiles, setSavedFiles] = useState({});
    const [currentGpxData, setCurrentGpxData] = useState(null);
    const [processedData, setProcessedData] = useState({ metrics: null, points: null });
    const [stats, setStats] = useState({});
    const [sidebarActive, setSidebarActive] = useState(false);
    const [chartsSidebarActive, setChartsSidebarActive] = useState(false);
    const [chartsFullscreen, setChartsFullscreen] = useState(false);

    useEffect(() => {
        setSavedFiles(getSavedFiles());
    }, []);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const gpxData = e.target.result;
            const updatedFiles = saveFile(file.name, gpxData);
            setSavedFiles(updatedFiles);
            loadGpx(gpxData);
        };
        reader.readAsText(file);
    };

    const loadGpx = (gpxData) => {
        setCurrentGpxData(gpxData);
        const { points, metrics } = processGpxData(gpxData);
        setProcessedData({ points, metrics });
        setSidebarActive(false);
        setChartsSidebarActive(false);
    };

    const handleTrackLoaded = useCallback((gpx) => {
        const distKm = gpx.get_distance() / 1000;
        const durationMs = gpx.get_total_time();
        const paceMinPerKm = distKm > 0 ? (durationMs / 1000 / 60) / distKm : 0;

        setStats({
            distance: distKm.toFixed(2) + " km",
            duration: formatDuration(durationMs),
            pace: paceMinPerKm > 0 ? formatPace(paceMinPerKm) : "-",
            elevationGain: gpx.get_elevation_gain().toFixed(0) + " m",
            elevationLoss: gpx.get_elevation_loss().toFixed(0) + " m"
        });
    }, []);

    const handleDeleteFile = (name) => {
        const updatedFiles = deleteFile(name);
        setSavedFiles(updatedFiles);
    };

    const toggleSidebar = () => {
        setSidebarActive(!sidebarActive);
        if (!sidebarActive) setChartsSidebarActive(false);
    };

    const toggleChartsSidebar = () => {
        setChartsSidebarActive(!chartsSidebarActive);
        if (!chartsSidebarActive) {
            setSidebarActive(false);
        } else {
            setChartsFullscreen(false);
        }
    };

    const closeSidebars = () => {
        setSidebarActive(false);
        setChartsSidebarActive(false);
    };

    return (
        <div className="App">
            <Header
                onToggleMenu={toggleSidebar}
                onToggleCharts={toggleChartsSidebar}
            />

            <div id="controls">
                <input type="file" id="gpx-file" accept=".gpx" onChange={handleFileUpload} />
            </div>

            <StatsBar stats={stats} />

            <div id="container">
                <Sidebar
                    active={sidebarActive}
                    savedFiles={savedFiles}
                    onSelectFile={(name) => loadGpx(savedFiles[name])}
                    onDeleteFile={handleDeleteFile}
                    onClose={closeSidebars}
                />

                <ChartsSidebar
                    active={chartsSidebarActive}
                    isFullscreen={chartsFullscreen}
                    onToggleFullscreen={() => setChartsFullscreen(!chartsFullscreen)}
                    onClose={closeSidebars}
                    data={processedData.metrics}
                    points={processedData.points}
                />

                {(sidebarActive || chartsSidebarActive) && (
                    <div id="sidebar-overlay" className="active" onClick={closeSidebars}></div>
                )}

                <MapComponent
                    gpxData={currentGpxData}
                    onTrackLoaded={handleTrackLoaded}
                />
            </div>
        </div>
    );
}

export default App;
