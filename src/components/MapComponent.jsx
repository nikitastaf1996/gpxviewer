import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-gpx';
import 'leaflet.fullscreen';
import 'leaflet.fullscreen/dist/Control.FullScreen.css';

const GpxLayer = ({ gpxData, onLoaded }) => {
  const map = useMap();
  const gpxLayerRef = useRef(null);

  useEffect(() => {
    if (gpxData) {
      if (gpxLayerRef.current) {
        map.removeLayer(gpxLayerRef.current);
      }

      const gpxLayer = new L.GPX(gpxData, {
        async: true,
        marker_options: {
          startIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
          endIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
          shadowUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png',
        },
      })
        .on('loaded', (e) => {
          const gpx = e.target;
          map.fitBounds(gpx.getBounds());
          onLoaded(gpx);
        })
        .addTo(map);

      gpxLayerRef.current = gpxLayer;
    }
  }, [gpxData, map, onLoaded]);

  return null;
};

const MapComponent = ({ gpxData, onLoaded }) => {
  return (
    <div id="map">
      <MapContainer
        center={[0, 0]}
        zoom={2}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        fullscreenControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GpxLayer gpxData={gpxData} onLoaded={onLoaded} />
      </MapContainer>
    </div>
  );
};

export default MapComponent;
