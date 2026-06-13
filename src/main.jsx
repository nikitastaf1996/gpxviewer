import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for Leaflet plugins that expect L to be global
window.L = L;
import 'leaflet.fullscreen/Control.FullScreen.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
