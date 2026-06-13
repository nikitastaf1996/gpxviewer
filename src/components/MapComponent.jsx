import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-gpx';
import 'leaflet.fullscreen';

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
                fullscreenControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <GpxTrack gpxData={gpxData} onLoaded={onTrackLoaded} />
            </MapContainer>
        </div>
    );
};

export default MapComponent;
