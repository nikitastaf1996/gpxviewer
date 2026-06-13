import React from 'react';

const StatsBar = ({ stats }) => {
    return (
        <div id="stats">
            <div className="stat-item">
                <span className="stat-label">Distance</span>
                <span className="stat-value">{stats.distance || '-'}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Total Time</span>
                <span className="stat-value">{stats.duration || '-'}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Pace</span>
                <span className="stat-value">{stats.pace || '-'}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Elevation Gain</span>
                <span className="stat-value">{stats.elevationGain || '-'}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Elevation Loss</span>
                <span className="stat-value">{stats.elevationLoss || '-'}</span>
            </div>
        </div>
    );
};

export default StatsBar;
