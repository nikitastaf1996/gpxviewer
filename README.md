# Simple GPX Viewer for Runners

A feature-rich, privacy-focused, web-based GPX file viewer designed specifically for runners. Visualize your tracks, analyze your performance with advanced charts, and manage your run library entirely in your browser.

## 🚀 Features

- **Interactive Map Visualization**: View your running routes on a high-quality OpenStreetMap with fullscreen support.
- **Comprehensive Statistics**:
  - Distance (km)
  - Total Duration
  - Average Pace (min/km)
  - Elevation Gain & Loss (m)
- **Advanced Performance Charts**:
  - **Elevation Profile**: Detailed altitude changes throughout your run.
  - **Pace & GAP**: Track your actual pace alongside Grade-Adjusted Pace (GAP) to see how hills affect your effort.
  - **Synchronized Combo Chart**: Overlay elevation and pace to identify performance trends on different terrains.
  - **Hill Consistency Matrix**: Analyze your consistency across different climbs.
  - **Split Performance**: Automatic 1km split breakdown with performance color-coding.
- **Run Library**:
  - **Persistent Storage**: Uses IndexedDB to save your runs locally in your browser.
  - **Bulk Import**: Upload multiple GPX files at once using ZIP archives.
  - **Automatic Geocoding**: Automatically identifies the closest city/town for each run.
- **Progressive Web App (PWA)**: Installable on mobile and desktop for offline use.
- **🔒 Privacy First**: All processing and data storage happen locally in your browser. Your GPX data is never uploaded to any server.

## 🛠 Technologies Used

- **[Alpine.js](https://alpinejs.dev/)**: Reactive UI framework for a smooth, single-page experience.
- **[Leaflet.js](https://leafletjs.com/)**: Interactive map engine.
- **[Chart.js](https://www.chartjs.org/)**: Powerful data visualization for performance metrics.
- **[JSZip](https://stuk.github.io/jszip/)**: Client-side ZIP decompression for bulk imports.
- **[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)**: Reliable, high-capacity local data storage.
- **[OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)**: Reverse geocoding for run locations.

## 📖 How to Use

1. **Access the App**: Open the `index.html` file or access the hosted version.
2. **Import Runs**:
   - Go to the **Library** tab.
   - Click **+** to add a single `.gpx` file.
   - Click **ZIP** to import multiple files from a ZIP archive.
3. **Analyze**:
   - Select a run from your Library to open it in the **Analyze** tab.
   - Explore the map and scroll down to view various performance charts.
4. **Settings**:
   - Toggle the visibility of specific charts to customize your dashboard.
   - Use the "Clear Library" option to reset your local data.

## 🌐 Deployment

This project is optimized for **GitHub Pages**. Simply host the files in a GitHub repository and enable Pages in the settings. Ensure all asset paths remain relative to support sub-path deployments.

---
*Built for runners who value their data and privacy.*
