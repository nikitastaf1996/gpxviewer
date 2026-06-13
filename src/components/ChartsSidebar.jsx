import React from 'react';
import ChartsContainer from './ChartsContainer';

const ChartsSidebar = ({ active, isFullscreen, onToggleFullscreen, onClose, data, points }) => {
    return (
        <div id="charts-sidebar" className={`sidebar-right ${active ? 'active' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
            <div className="sidebar-header">
                <h3>Charts & Analysis</h3>
                <div className="header-actions">
                    <button id="charts-fullscreen" className="action-btn" onClick={onToggleFullscreen} aria-label="Fullscreen Charts">⛶</button>
                    <button className="close-sidebar" onClick={onClose} aria-label="Close Charts">&times;</button>
                </div>
            </div>
            <ChartsContainer data={data} points={points} />
        </div>
    );
};

export default ChartsSidebar;
