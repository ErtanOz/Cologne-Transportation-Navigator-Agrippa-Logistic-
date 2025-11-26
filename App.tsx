import React, { useState, useCallback, useEffect } from 'react';
import { MapComponent } from './components/MapComponent';
import { InfoPanel } from './components/InfoPanel';
import { Coordinates, StreetAnalysis, VehicleType, MapMarkerData, RouteAnalysis, LiveTrafficData, WeatherData } from './types';
import { analyzeStreetConditions, analyzeRouteLogistics, getLiveTrafficUpdates, getWeatherLogistics } from './services/geminiService';
import { calculateRoute } from './services/routingService';
import { getStreetGeometry, getNearestStreetDetails } from './services/osmService';
import { geocodeStreet } from './services/geocodingService';
import { AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>(VehicleType.LKW_HEAVY);
  const [mode, setMode] = useState<'explore' | 'route'>('explore');
  
  // Explore Mode State
  const [analysis, setAnalysis] = useState<StreetAnalysis | null>(null);
  const [highlightedSegments, setHighlightedSegments] = useState<Coordinates[][]>([]);
  const [isHighlightSuitable, setIsHighlightSuitable] = useState<boolean>(true);
  
  // Route Mode State
  const [routePoints, setRoutePoints] = useState<Coordinates[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]); // For Polyline
  const [routeAnalysis, setRouteAnalysis] = useState<RouteAnalysis | null>(null);
  const [routeStreetNames, setRouteStreetNames] = useState<string[]>([]);

  // Common State
  const [loading, setLoading] = useState<boolean>(false);
  const [liveTraffic, setLiveTraffic] = useState<LiveTrafficData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [markers, setMarkers] = useState<MapMarkerData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initial Data Fetch
  useEffect(() => {
    getWeatherLogistics().then(data => setWeather(data));
  }, []);

  const handleLocationSelect = useCallback(async (coords: Coordinates) => {
    setError(null);

    if (mode === 'explore') {
      // --- EXPLORE MODE ---
      setLoading(true);
      setAnalysis(null);
      setLiveTraffic(null);
      setRouteAnalysis(null);
      setHighlightedSegments([]); // Clear previous highlight
      
      const newMarker: MapMarkerData = {
        id: `user-${Date.now()}`,
        position: coords,
        name: "Selected Location",
        type: 'user-selected'
      };
      setMarkers([newMarker]);

      try {
        // 1. Get exact street details from OSM (Width, Type, Name)
        const osmDetails = await getNearestStreetDetails(coords.lat, coords.lng);
        const streetNameForQuery = osmDetails?.name || `coordinates ${coords.lat}, ${coords.lng}`;

        // 2. Run Gemini analysis (with OSM context) and live traffic in parallel
        const [analysisResult, liveResult] = await Promise.all([
          analyzeStreetConditions(coords.lat, coords.lng, selectedVehicle, osmDetails),
          getLiveTrafficUpdates(`Traffic at ${streetNameForQuery} in Cologne`)
        ]);

        setAnalysis(analysisResult);
        setIsHighlightSuitable(analysisResult.isTruckSuitable);

        // 3. Highlight street geometry
        // Prefer using OSM verified name, otherwise fallback to Gemini's
        const validName = osmDetails?.name || analysisResult.streetName;
        
        if (validName && !validName.includes("Analysis Failed") && validName !== "Unnamed Road") {
          getStreetGeometry(validName, coords.lat, coords.lng)
            .then(segments => setHighlightedSegments(segments))
            .catch(e => console.error("Could not highlight street", e));
        }
        
        // 4. Update Live Traffic
        setLiveTraffic(liveResult);

      } catch (err) {
        console.error(err);
        setError("Failed to analyze location.");
      } finally {
        setLoading(false);
      }
    } else {
      // --- ROUTE MODE ---
      if (routePoints.length >= 10) {
        setError("Max 10 waypoints allowed.");
        return;
      }
      
      const newPoint = coords;
      const updatedPoints = [...routePoints, newPoint];
      setRoutePoints(updatedPoints);

      const newMarker: MapMarkerData = {
        id: `route-${Date.now()}`,
        position: coords,
        name: `Stop ${updatedPoints.length}`,
        type: 'route-point',
        index: updatedPoints.length
      };
      setMarkers(prev => [...prev, newMarker]);
    }
  }, [mode, selectedVehicle, routePoints]);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const coords = await geocodeStreet(query);
      if (coords) {
        await handleLocationSelect(coords);
      } else {
        setError("Location not found in Cologne.");
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Search failed.");
      setLoading(false);
    }
  };

  const handleCalculateRoute = async () => {
    if (routePoints.length < 2) return;
    
    setLoading(true);
    setError(null);
    setRouteAnalysis(null);
    setLiveTraffic(null);
    setHighlightedSegments([]); // Clear explore highlights in route mode

    try {
      // 1. Get Geometry from OSRM
      const routeData = await calculateRoute(routePoints);
      setRouteCoordinates(routeData.coordinates);
      setRouteStreetNames(routeData.streetNames);

      // 2. Analyze Route Logistics & Fetch Live Traffic in Parallel
      const [analysisResult, liveResult] = await Promise.all([
        analyzeRouteLogistics(selectedVehicle, routeData.streetNames),
        getLiveTrafficUpdates(`Traffic conditions on route: ${routeData.streetNames.slice(0, 5).join(", ")}... in Cologne`)
      ]);

      setRouteAnalysis(analysisResult);
      setLiveTraffic(liveResult);

    } catch (err) {
      console.error(err);
      setError("Failed to calculate or analyze route.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearRoute = () => {
    setRoutePoints([]);
    setRouteCoordinates([]);
    setRouteStreetNames([]);
    setRouteAnalysis(null);
    setLiveTraffic(null);
    setMarkers(prev => prev.filter(m => m.type !== 'route-point')); 
    setMarkers([]); 
  };

  const handleModeSwitch = (newMode: 'explore' | 'route') => {
    setMode(newMode);
    setError(null);
    setHighlightedSegments([]);
    if (newMode === 'explore') {
        setRoutePoints([]);
        setRouteCoordinates([]);
        setMarkers([]);
    } else {
        setAnalysis(null);
        setLiveTraffic(null);
        setMarkers([]);
    }
  };

  return (
    <div className="relative w-screen h-screen bg-gray-900 overflow-hidden">
      <MapComponent 
        onLocationSelect={handleLocationSelect} 
        markers={markers}
        mode={mode}
        routeCoordinates={routeCoordinates}
        highlightedSegments={highlightedSegments}
        isHighlightSuitable={isHighlightSuitable}
        vehicleType={selectedVehicle}
      />

      <InfoPanel 
        mode={mode}
        setMode={handleModeSwitch}
        analysis={analysis}
        routeAnalysis={routeAnalysis}
        liveTraffic={liveTraffic}
        weather={weather}
        loading={loading}
        selectedVehicle={selectedVehicle}
        onVehicleChange={(type) => {
            setSelectedVehicle(type);
            setAnalysis(null);
            setRouteAnalysis(null);
            setLiveTraffic(null);
            setHighlightedSegments([]);
        }}
        routePoints={routePoints}
        onClearRoute={handleClearRoute}
        onCalculateRoute={handleCalculateRoute}
        routeStreetNames={routeStreetNames}
        onSearch={handleSearch}
      />

      {error && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-red-600/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 z-[2000] animate-bounce">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      <div className="absolute bottom-4 right-4 bg-gray-900/80 backdrop-blur text-xs text-gray-500 px-3 py-1 rounded border border-gray-800 pointer-events-none z-[1000]">
        Powered by Google Gemini 2.5 • OSRM • OpenStreetMap • Overpass API
      </div>
    </div>
  );
};

export default App;