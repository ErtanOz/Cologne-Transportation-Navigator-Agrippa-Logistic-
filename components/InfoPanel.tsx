import React, { useState } from 'react';
import { StreetAnalysis, VehicleType, RouteAnalysis, Coordinates, LiveTrafficData, WeatherData } from '../types';
import { AlertTriangle, MapPin, Truck, CheckCircle2, XCircle, Navigation, Map, Route as RouteIcon, Trash2, PlayCircle, Radio, ExternalLink, ArrowRight, BarChart3, List, CloudSun, ArrowLeftRight, Columns, Scan, Activity, Zap, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface InfoPanelProps {
  mode: 'explore' | 'route';
  setMode: (mode: 'explore' | 'route') => void;
  analysis: StreetAnalysis | null;
  routeAnalysis: RouteAnalysis | null;
  liveTraffic: LiveTrafficData | null;
  weather: WeatherData | null;
  loading: boolean;
  selectedVehicle: VehicleType;
  onVehicleChange: (type: VehicleType) => void;
  routePoints: Coordinates[];
  onClearRoute: () => void;
  onCalculateRoute: () => void;
  routeStreetNames?: string[];
  onSearch: (query: string) => void;
}

const CongestionChart: React.FC<{ data: number[] }> = ({ data }) => {
  const timeLabels = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];
  
  return (
    <div className="mt-4 bg-black/40 p-4 rounded-xl border border-white/10 backdrop-blur-sm relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
      <div className="flex items-center gap-2 mb-4 text-xs font-bold text-cyan-400 uppercase tracking-widest font-mono">
        <Activity className="w-3 h-3" /> Traffic Density Profile
      </div>
      <div className="flex items-end justify-between h-20 gap-1">
        {data.map((val, i) => {
          let colorClass = "bg-cyan-500";
          let specialEffects = "";

          if (val > 4) colorClass = "bg-amber-500";
          if (val > 7) {
            colorClass = "bg-red-500";
            // Add subtle pulse and glow for high congestion
            specialEffects = "animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.8)] z-10 brightness-110";
          }
          
          return (
            <div key={i} className="flex flex-col items-center gap-1 w-full relative">
              <div 
                className={`w-full rounded-sm transition-all duration-700 ease-out opacity-80 group-hover:opacity-100 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${colorClass} ${specialEffects}`} 
                style={{ height: `${Math.max(val * 10, 5)}%` }}
              ></div>
              <span className="text-[8px] text-gray-500 font-mono">{i % 2 === 0 ? timeLabels[i] : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SuitabilityGauge: React.FC<{ score: number }> = ({ score }) => {
  const radius = 30;
  const stroke = 4;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  let color = "text-emerald-500";
  if (score < 70) color = "text-amber-500";
  if (score < 40) color = "text-red-500";

  return (
    <div className="flex flex-col items-center justify-center relative">
      <svg height={radius * 2} width={radius * 2} className="rotate-[-90deg]">
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className={`${color} transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]`}
        />
        <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="text-gray-800 -z-10 absolute opacity-30"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-lg font-mono font-bold ${color}`}>{score}</span>
      </div>
    </div>
  );
};

export const InfoPanel: React.FC<InfoPanelProps> = ({ 
  mode,
  setMode,
  analysis, 
  routeAnalysis,
  liveTraffic,
  weather,
  loading, 
  selectedVehicle, 
  onVehicleChange,
  routePoints,
  onClearRoute,
  onCalculateRoute,
  routeStreetNames,
  onSearch
}) => {
  const [showStreets, setShowStreets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const isWidthRestriction = analysis && !analysis.isTruckSuitable && 
    (analysis.restrictionReason?.toLowerCase().includes('width') || 
     analysis.restrictionReason?.toLowerCase().includes('narrow'));

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery);
      setSearchQuery("");
    }
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] w-[420px] font-sans select-none pointer-events-none">
      {/* Enable pointer events only for the cards and handle scrolling */}
      <div className="pointer-events-auto flex flex-col gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 pb-4 scroll-smooth">
        
        {/* HEADER / CONTROL DECK */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl relative overflow-hidden shrink-0">
          {/* Decorative scanner line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50"></div>
          
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-black italic tracking-tighter text-white flex items-center gap-2">
                <Scan className="w-6 h-6 text-cyan-400" />
                AGRIPPA<span className="text-cyan-400">LOGISTICS</span>
              </h1>
              <div className="text-[10px] font-mono text-cyan-400/60 tracking-widest uppercase mt-1">
                Cologne Operations Center • V2.5
              </div>
            </div>
            {weather && (
               <div className="text-right">
                  <div className="flex items-center justify-end gap-2 text-white font-mono font-bold text-sm">
                    {weather.temp} <CloudSun className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">{weather.condition}</div>
               </div>
            )}
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative mb-4 group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-500 group-focus-within:text-cyan-400 transition-colors" />
            </div>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search street name..."
                className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-lg leading-5 bg-black/40 text-gray-300 placeholder-gray-600 focus:outline-none focus:bg-black/60 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 sm:text-xs font-mono transition-all"
            />
            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/5 pointer-events-none" />
          </form>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5 mb-5">
            <button
              onClick={() => setMode('explore')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                mode === 'explore' 
                  ? 'bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)] border border-cyan-500/30' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Map className="w-3 h-3" /> Sector Scan
            </button>
            <button
              onClick={() => setMode('route')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                mode === 'route' 
                  ? 'bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] border border-blue-500/30' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <RouteIcon className="w-3 h-3" /> Pathfinding
            </button>
          </div>

          {/* Vehicle Selector */}
          <div className="space-y-3">
             <div className="flex justify-between items-center text-[10px] font-mono uppercase text-gray-500 tracking-widest">
                <span>Active Vehicle Profile</span>
                <span className="text-cyan-600">ID: {selectedVehicle.replace(/[^a-zA-Z]/g, '').substring(0,3).toUpperCase()}-09</span>
             </div>
             <div className="grid grid-cols-1 gap-2">
              {Object.values(VehicleType).map((type) => (
                <button
                  key={type}
                  onClick={() => onVehicleChange(type)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200 group ${
                    selectedVehicle === type
                      ? 'bg-gradient-to-r from-blue-900/40 to-slate-900 border-blue-500/50 shadow-lg'
                      : 'bg-black/20 border-white/5 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded bg-black/40 ${selectedVehicle === type ? 'text-blue-400' : 'text-gray-600'}`}>
                      <Truck className="w-4 h-4" />
                    </div>
                    <span className={`text-xs font-bold ${selectedVehicle === type ? 'text-blue-100' : 'text-gray-400'}`}>
                      {type}
                    </span>
                  </div>
                  {selectedVehicle === type && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>}
                </button>
              ))}
             </div>
          </div>

          {/* Action Button (Route Mode) */}
          {mode === 'route' && (
            <div className="mt-5 pt-5 border-t border-white/10 animate-in fade-in slide-in-from-top-2">
               <div className="flex justify-between items-center mb-3">
                  <div className="flex gap-1">
                    {routePoints.map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    ))}
                    {routePoints.length < 2 && <div className="w-1.5 h-1.5 rounded-full bg-gray-700 animate-pulse"></div>}
                  </div>
                  {routePoints.length > 0 && (
                    <button onClick={onClearRoute} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 uppercase font-bold tracking-wider">
                      <Trash2 className="w-3 h-3" /> Purge Data
                    </button>
                  )}
               </div>
               <button
                  onClick={onCalculateRoute}
                  disabled={routePoints.length < 2 || loading}
                  className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all relative overflow-hidden ${
                    routePoints.length < 2 
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-white/5' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-400/30'
                  }`}
                >
                  {loading && <div className="absolute inset-0 bg-white/10 animate-pulse"></div>}
                  {loading ? 'Processing...' : (
                    <>
                      <Zap className="w-4 h-4" /> Initialize Route
                    </>
                  )}
               </button>
            </div>
          )}
        </div>

        {/* LOADING STATE - SCANNER */}
        {loading && (
           <div className="bg-slate-900/80 backdrop-blur-xl border border-cyan-500/30 p-8 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.1)_50%,transparent_100%)] h-[200%] w-full animate-[scanner_2s_linear_infinite]"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 border-4 border-cyan-900 border-t-cyan-400 rounded-full animate-spin mb-4 mx-auto"></div>
                <h3 className="text-cyan-400 font-mono font-bold text-lg animate-pulse">ACQUIRING DATA...</h3>
                <p className="text-xs text-cyan-600/80 font-mono mt-2">Connecting to Gemini Neural Net</p>
              </div>
           </div>
        )}

        {/* EXPLORE ANALYSIS CARD */}
        {!loading && analysis && mode === 'explore' && (
          <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500 shrink-0">
             {/* Header Status Bar */}
             <div className={`h-1.5 w-full ${analysis.isTruckSuitable ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`}></div>
             
             <div className="p-5">
                <div className="flex justify-between items-start mb-6">
                   <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                         {analysis.streetName}
                      </h2>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                           analysis.isTruckSuitable 
                             ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                             : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                           {analysis.isTruckSuitable ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                        </span>
                        {!analysis.isTruckSuitable && (
                           <span className="text-[10px] text-red-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {analysis.restrictionReason}
                           </span>
                        )}
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">Risk Score</div>
                      <div className={`text-2xl font-mono font-bold ${analysis.congestionScore > 6 ? 'text-red-500' : 'text-emerald-500'}`}>
                         {analysis.congestionScore}/10
                      </div>
                   </div>
                </div>

                {/* Technical Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                   <div className={`p-4 rounded-xl border relative overflow-hidden ${isWidthRestriction ? 'bg-red-500/10 border-red-500/40' : 'bg-white/5 border-white/5'}`}>
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                         <ArrowLeftRight className="w-3 h-3" />
                         <span className="text-[9px] uppercase tracking-widest font-bold">Width</span>
                      </div>
                      <div className="text-2xl font-mono text-white tracking-tight">
                         {analysis.streetWidth || "N/A"}
                      </div>
                      {isWidthRestriction && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_red]"></div>}
                   </div>
                   <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                         {analysis.lanes ? <Columns className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                         <span className="text-[9px] uppercase tracking-widest font-bold">{analysis.lanes ? "Lanes" : "Limit"}</span>
                      </div>
                      <div className="text-2xl font-mono text-white tracking-tight">
                         {analysis.lanes || analysis.maxWeight || "STD"}
                      </div>
                   </div>
                </div>

                {/* Analysis Text */}
                <div className="bg-black/20 rounded-xl p-4 border border-white/5 mb-6 text-sm text-gray-300 leading-relaxed font-light">
                   {analysis.description}
                </div>

                {/* Visualization Components */}
                <CongestionChart data={analysis.congestionCurve} />

                {/* Alternatives */}
                {!analysis.isTruckSuitable && analysis.alternativeRoutes.length > 0 && (
                   <div className="mt-4 pt-4 border-t border-white/10">
                      <h4 className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                         <Navigation className="w-3 h-3" /> Recalculation Available
                      </h4>
                      <div className="space-y-1">
                         {analysis.alternativeRoutes.map((r, i) => (
                            <div key={i} className="text-xs text-gray-300 flex items-center gap-2 bg-white/5 p-2 rounded border border-white/5 hover:border-emerald-500/30 transition-colors">
                               <ArrowRight className="w-3 h-3 text-emerald-500" /> {r}
                            </div>
                         ))}
                      </div>
                   </div>
                )}
                
                {/* Live Traffic */}
                {liveTraffic && (
                   <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                         <span className="relative flex h-2 w-2">
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                           <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                         </span>
                         <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Live Net Feed</span>
                      </div>
                      <div className="text-xs text-blue-100/80 markdown-content">
                         <ReactMarkdown>{liveTraffic.summary}</ReactMarkdown>
                      </div>
                   </div>
                )}
             </div>
          </div>
        )}

        {/* ROUTE ANALYSIS CARD */}
        {!loading && routeAnalysis && mode === 'route' && (
          <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500 shrink-0">
             <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                   <div>
                      <h2 className="text-lg font-bold text-white mb-1">Route Diagnostics</h2>
                      <div className="text-xs text-gray-400">{routePoints.length} Waypoints • {routeAnalysis.trafficPrediction.split('.')[0]}</div>
                   </div>
                   <SuitabilityGauge score={routeAnalysis.suitabilityScore} />
                </div>

                {/* Warnings */}
                {routeAnalysis.majorWarnings.length > 0 && (
                   <div className="mb-4 bg-red-500/10 border-l-2 border-red-500 p-3">
                      <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">Critical Alerts</h4>
                      <ul className="space-y-1">
                         {routeAnalysis.majorWarnings.map((w, i) => (
                            <li key={i} className="text-xs text-red-200 flex items-start gap-2">
                               <span className="mt-0.5">•</span> {w}
                            </li>
                         ))}
                      </ul>
                   </div>
                )}

                {/* Problem Streets Tags */}
                {routeAnalysis.problematicStreets.length > 0 && (
                   <div className="mb-4">
                      <h4 className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-2">Caution Zones</h4>
                      <div className="flex flex-wrap gap-2">
                         {routeAnalysis.problematicStreets.map((street, i) => (
                            <span key={i} className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs rounded">
                               {street}
                            </span>
                         ))}
                      </div>
                   </div>
                )}

                {/* Street List Toggle */}
                {routeStreetNames && (
                   <div className="border-t border-white/10 pt-3">
                      <button 
                         onClick={() => setShowStreets(!showStreets)}
                         className="w-full flex justify-between items-center text-xs text-gray-500 hover:text-white uppercase font-bold tracking-widest transition-colors"
                      >
                         Segment Manifest <List className="w-3 h-3" />
                      </button>
                      {showStreets && (
                         <div className="mt-3 space-y-1 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {routeStreetNames.map((name, i) => {
                               const isBad = routeAnalysis.problematicStreets.some(s => name.includes(s));
                               return (
                                  <div key={i} className={`text-xs p-2 rounded flex justify-between ${isBad ? 'bg-red-500/10 text-red-300' : 'bg-white/5 text-gray-400'}`}>
                                     <span>{i+1}. {name}</span>
                                     {isBad && <AlertTriangle className="w-3 h-3" />}
                                  </div>
                               )
                            })}
                         </div>
                      )}
                   </div>
                )}
             </div>
          </div>
        )}

      </div>
    </div>
  );
};