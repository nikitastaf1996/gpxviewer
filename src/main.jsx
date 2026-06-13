import React from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import App from './App';
import './index.css';

// Ensure Leaflet is available globally for plugins
window.L = L;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
