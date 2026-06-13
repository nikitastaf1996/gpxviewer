# Simple GPX Viewer for Runners

A simple, web-based GPX file viewer designed for runners, now built with **React** and **Vite**. Upload your GPX tracks to visualize them on a map and see key statistics and interactive charts.

## Features

- **Map Visualization**: View your running route on an interactive map.
- **Detailed Statistics**:
  - Distance (km)
  - Total Time
  - Average Pace (min/km)
  - Elevation Gain/Loss (m)
- **Interactive Charts**: Visualize Pace, Elevation, Grade, and Grade-Adjusted Pace (GAP).
- **Hill Detection**: Automatically identifies climbs and provides a consistency matrix.
- **Progressive Web App (PWA)**: Installable on your device and works offline.
- **Privacy**: All processing is done client-side. Your data never leaves your browser.

## Getting Started

### Local Development

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser to `http://localhost:8080`.

### Building for Production

To create a production-ready build in the `dist/` directory:
```bash
npm run build
```

## Deployment

This project is configured for automated deployment to **GitHub Pages**.

- **CI/CD**: A GitHub Action (`.github/workflows/deploy.yml`) builds and deploys the app automatically whenever changes are pushed to the `main` branch.
- **Base URL**: The application uses relative paths (`base: './'`) for compatibility with GitHub Pages subpaths.

## Technologies Used

- [React](https://reactjs.org/) - UI framework.
- [Vite](https://vitejs.dev/) - Build tool and dev server.
- [Leaflet.js](https://leafletjs.com/) & [React-Leaflet](https://react-leaflet.js.org/) - Interactive maps.
- [Chart.js](https://www.chartjs.org/) - Data visualization.
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) - PWA support.
