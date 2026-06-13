import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-gpx';
import 'leaflet.fullscreen';

// Fix for default marker icons in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom component to add Fullscreen control properly
const FullscreenControl = () => {
    const map = useMap();
    useEffect(() => {
        const control = L.control.fullscreen({
            position: 'topleft',
            forceSeparateButton: true
        }).addTo(map);
        return () => {
            map.removeControl(control);
        };
    }, [map]);
    return null;
};

const GpxTrack = ({ gpxData, onLoaded }) => {
    const map = useMap();
    const trackRef = useRef(null);

    useEffect(() => {
        if (!gpxData) return;

        if (trackRef.current) {
            map.removeLayer(trackRef.current);
        }

        trackRef.current = new L.GPX(gpxData, {
            async: true,
            marker_options: {
                startIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-start.png',
                endIconUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-icon-end.png',
                shadowUrl: 'https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@master/pin-shadow.png'
            }
        }).on('loaded', (e) => {
            const gpx = e.target;
            map.fitBounds(gpx.getBounds());
            onLoaded(gpx);
        }).addTo(map);

        return () => {
            if (trackRef.current) {
                map.removeLayer(trackRef.current);
            }
        };
    }, [gpxData, map, onLoaded]);

    return null;
};

const MapComponent = ({ gpxData, onTrackLoaded }) => {
    return (
        <div id="main-content">
            <MapContainer
                center={[0, 0]}
                zoom={2}
                id="map"
                zoomControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FullscreenControl />
                <GpxTrack gpxData={gpxData} onLoaded={onTrackLoaded} />
            </MapContainer>
        </div>
    );
};

export default MapComponent;
