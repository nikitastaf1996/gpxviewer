# Simple GPX Viewer for Runners

A simple, web-based GPX file viewer designed for runners. Upload your GPX tracks to visualize them on a map and see key statistics.

## Features

- **Map Visualization**: View your running route on an interactive OpenStreetMap.
- **Statistics**:
  - Distance (km)
  - Total Time
  - Average Pace (min/km)
  - Elevation Gain/Loss (m)
- **Privacy**: All processing is done in your browser. No data is uploaded to any server.

## How to Use

1. Open `index.html` in any modern web browser.
2. Click the "Choose File" button.
3. Select a `.gpx` file from your computer.
4. The map will automatically zoom to your track, and statistics will be displayed.

## Deployment

This project is compatible with GitHub Pages. Simply host the `index.html` file on your GitHub repository and enable GitHub Pages in the repository settings.

## Technologies Used

- [Leaflet.js](https://leafletjs.com/) - Mobile-friendly interactive maps.
- [leaflet-gpx](https://github.com/mpetazzoni/leaflet-gpx) - Leaflet plugin for GPX tracks.
- [OpenStreetMap](https://www.openstreetmap.org/) - Map data.
