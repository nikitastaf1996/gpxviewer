import React from 'react';

const Header = ({ onToggleSidebar, onToggleCharts }) => {
  return (
    <header>
      <button id="menu-toggle" onClick={onToggleSidebar} aria-label="Toggle Sidebar">☰</button>
      <h1>GPX Viewer for Runners</h1>
      <button id="charts-toggle" onClick={onToggleCharts} aria-label="Toggle Charts">📊</button>
    </header>
  );
};

export default Header;
