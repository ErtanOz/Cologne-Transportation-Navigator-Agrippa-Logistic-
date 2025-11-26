import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, CircleMarker, Polyline } from 'react-leaflet';
import { Coordinates, MapMarkerData, VehicleType } from '../types';
import L from 'leaflet';

// Fix for default Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapComponentProps {
  onLocationSelect: (coords: Coordinates) => void;
  markers: MapMarkerData[];
  mode: 'explore' | 'route';
  routeCoordinates?: [number, number][]; // lat, lng array
  highlightedSegments?: Coordinates[][]; // For displaying the analyzed street
  isHighlightSuitable?: boolean;
  vehicleType?: VehicleType;
}

const LocationMarker: React.FC<{ onSelect: (coords: Coordinates) => void }> = ({ onSelect }) => {
  useMapEvents({
    click(e) {
      onSelect(e.latlng);
    },
  });
  return null;
};

// --- Custom Icon Generators ---

const createTargetIcon = (type: 'default' | 'warning' | 'danger', number?: number) => {
  let colorClass = '';
  if (type === 'warning') colorClass = 'warning';
  if (type === 'danger') colorClass = 'danger';

  return L.divIcon({
    className: 'custom-target-icon',
    html: `
      <div class="target-reticle ${colorClass}">
        <div class="target-center"></div>
        ${number ? `<span style="position:absolute; top:-15px; right:-15px; font-weight:bold; font-size:10px; background:#0f172a; padding:2px 6px; border-radius:4px; border:1px solid currentColor;">${number}</span>` : ''}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const createPulseIcon = () => {
  return L.divIcon({
    className: 'custom-pulse-icon',
    html: '<div class="marker-pulse"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// --- Vehicle Animation Component ---

// Math Helpers
const toRad = (d: number) => d * Math.PI / 180;
const toDeg = (r: number) => r * 180 / Math.PI;

const getBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371e3; // metres
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const getVehicleIconHtml = (type: VehicleType, bearing: number) => {
  // Changed to Neon Amber/Orange for high contrast against blue route line
  const color = '#f59e0b'; 
  const glow = 'drop-shadow(0 0 8px #f59e0b)';
  
  let path = '';
  // Simple Top-Down SVG Paths
  if (type === VehicleType.CAR) {
    // Car shape
    path = "M10 2L14 5L14 18L10 20L6 18L6 5L10 2M6 8L14 8M6 14L14 14"; 
  } else if (type === VehicleType.LKW_LIGHT) {
    // Van shape
    path = "M7 2L13 2L14 6L14 20L6 20L6 6L7 2M6 6L14 6";
  } else {
    // Heavy Truck (Semi) shape
    path = "M7 14L13 14L13 22L7 22L7 14M6 2L14 2L14 12L6 12L6 2";
  }

  return `
    <div style="transform: rotate(${bearing}deg); transition: transform 0.1s linear; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
      <svg width="24" height="24" viewBox="0 0 20 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: ${glow}; fill: rgba(15, 23, 42, 0.9);">
        <path d="${path}" />
      </svg>
    </div>
  `;
};

const AnimatedRouteMarker: React.FC<{ 
  route: [number, number][], 
  vehicleType: VehicleType 
}> = ({ route, vehicleType }) => {
  const markerRef = useRef<L.Marker>(null);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>(0);
  
  // Flatten route to distances
  // We pre-calculate accumulated distances to easily find position at time t
  const segments = React.useMemo(() => {
    if (route.length < 2) return [];
    let totalDist = 0;
    const dists = [0];
    for (let i = 0; i < route.length - 1; i++) {
      const d = getDistance(route[i][0], route[i][1], route[i+1][0], route[i+1][1]);
      totalDist += d;
      dists.push(totalDist);
    }
    return { totalDist, dists };
  }, [route]);

  useEffect(() => {
    if (!segments.totalDist || route.length < 2) return;

    // Animation Speed: e.g., 200 meters per second simulation scale (fast!) or fixed duration
    // Let's use fixed duration for better UX: 10 seconds for the whole route
    const DURATION = 10000; // ms

    const animate = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;
      const progress = (elapsed % DURATION) / DURATION; // Loop 0 to 1

      const currentDist = progress * segments.totalDist;

      // Find segment
      let index = 0;
      for (let i = 0; i < segments.dists.length - 1; i++) {
        if (currentDist >= segments.dists[i] && currentDist < segments.dists[i+1]) {
          index = i;
          break;
        }
      }

      // Interpolate
      const segmentLen = segments.dists[index+1] - segments.dists[index];
      const segmentProgress = (currentDist - segments.dists[index]) / segmentLen;
      
      const p1 = route[index];
      const p2 = route[index+1];
      
      if (p1 && p2) {
        const lat = p1[0] + (p2[0] - p1[0]) * segmentProgress;
        const lng = p1[1] + (p2[1] - p1[1]) * segmentProgress;
        const bearing = getBearing(p1[0], p1[1], p2[0], p2[1]);

        if (markerRef.current) {
           markerRef.current.setLatLng([lat, lng]);
           
           // Update Icon Rotation
           const icon = L.divIcon({
             className: 'vehicle-anim-icon',
             html: getVehicleIconHtml(vehicleType, bearing),
             iconSize: [24, 24],
             iconAnchor: [12, 12]
           });
           markerRef.current.setIcon(icon);
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [route, segments, vehicleType]);

  if (route.length < 2) return null;

  // Initial Position
  return (
    <Marker 
      ref={markerRef}
      position={route[0]} 
      zIndexOffset={1000} // Keep above other markers
    />
  );
};


const HOTSPOTS: MapMarkerData[] = [
  { id: '1', name: 'Heumarkt (Heavy Traffic)', position: { lat: 50.9366, lng: 6.9620 }, type: 'hotspot' },
  { id: '2', name: 'Hohe Straße (Pedestrian Zone)', position: { lat: 50.9385, lng: 6.9575 }, type: 'hotspot' },
  { id: '3', name: 'Deutzer Brücke (Bridge)', position: { lat: 50.9369, lng: 6.9692 }, type: 'hotspot' },
  { id: '4', name: 'Severinstraße (Narrow)', position: { lat: 50.9298, lng: 6.9587 }, type: 'hotspot' },
  { id: '5', name: 'Venloer Straße (Congestion)', position: { lat: 50.9427, lng: 6.9242 }, type: 'hotspot' },
];

export const MapComponent: React.FC<MapComponentProps> = ({ 
  onLocationSelect, 
  markers, 
  mode,
  routeCoordinates,
  highlightedSegments,
  isHighlightSuitable,
  vehicleType = VehicleType.LKW_HEAVY
}) => {
  const cologneCenter: Coordinates = { lat: 50.9375, lng: 6.9603 };

  return (
    <div className="h-full w-full z-0 relative">
      {/* Visual Overlay Scanlines */}
      <div className="absolute inset-0 pointer-events-none z-[400] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_2px,3px_100%] pointer-events-none"></div>

      <MapContainer
        center={cologneCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="h-full w-full outline-none"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <LocationMarker onSelect={onLocationSelect} />

        {/* Hotspots - Pulsing Beacons */}
        {HOTSPOTS.map((hotspot) => (
          <Marker
            key={hotspot.id}
            position={hotspot.position}
            icon={createPulseIcon()}
            eventHandlers={{
              click: () => onLocationSelect(hotspot.position),
            }}
          >
            <Popup className="custom-popup">
              <div className="font-mono text-xs">
                <strong className="text-cyan-400 block mb-1">{hotspot.name}</strong>
                <span className="text-gray-400">
                  {mode === 'explore' ? 'SYSTEM: Ready to analyze' : 'SYSTEM: Waypoint available'}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Highlighted Street Segments (Explore Mode) - Glowing Neon */}
        {highlightedSegments && highlightedSegments.map((segment, idx) => (
          <React.Fragment key={`highlight-group-${idx}`}>
            {/* Inner Glow */}
            <Polyline
              positions={segment}
              pathOptions={{
                color: isHighlightSuitable ? '#10B981' : '#EF4444', 
                weight: 12,
                opacity: 0.2,
                lineCap: 'round',
                className: 'blur-[2px]'
              }}
            />
            {/* Core Line */}
            <Polyline
              positions={segment}
              pathOptions={{
                color: isHighlightSuitable ? '#34d399' : '#f87171', 
                weight: 3,
                opacity: 1,
                lineCap: 'round'
              }}
            />
          </React.Fragment>
        ))}

        {/* Route Polyline - Animated Data Flow */}
        {routeCoordinates && routeCoordinates.length > 0 && (
          <React.Fragment>
            {/* Background Path */}
            <Polyline 
              positions={routeCoordinates} 
              pathOptions={{ color: '#1e3a8a', weight: 8, opacity: 0.5 }} 
            />
            {/* Animated Foreground */}
            <Polyline 
              positions={routeCoordinates} 
              pathOptions={{ 
                color: '#3b82f6', 
                weight: 3, 
                opacity: 0.9,
                className: 'route-flow-line' 
              }} 
            />
            {/* Animated Vehicle */}
            <AnimatedRouteMarker route={routeCoordinates} vehicleType={vehicleType} />
          </React.Fragment>
        )}

        {/* User Markers - Holographic Targets */}
        {markers.map((marker, idx) => {
           let type: 'default' | 'warning' | 'danger' = 'default';
           // If we have highlight info, we can color code the marker itself
           if (mode === 'explore' && highlightedSegments && highlightedSegments.length > 0) {
              type = isHighlightSuitable ? 'default' : 'danger';
           }
           
           return (
             (marker.type === 'user-selected' || marker.type === 'route-point') && (
              <Marker 
                key={marker.id} 
                position={marker.position}
                icon={createTargetIcon(type, marker.type === 'route-point' ? idx + 1 : undefined)}
              >
                 <Popup>
                   <div className="font-mono text-xs">
                     <span className="text-cyan-400 font-bold block">TARGET LOCKED</span>
                     {marker.type === 'route-point' ? `WAYPOINT ALPHA-${idx + 1}` : 'COORDINATES SELECTED'}
                   </div>
                 </Popup>
              </Marker>
             )
           );
        })}

      </MapContainer>
    </div>
  );
};