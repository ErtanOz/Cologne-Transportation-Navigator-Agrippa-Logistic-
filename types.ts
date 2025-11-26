export enum VehicleType {
  CAR = 'Car',
  LKW_LIGHT = 'LKW (Light < 7.5t)',
  LKW_HEAVY = 'LKW (Heavy > 7.5t)',
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface OsmStreetDetails {
  name: string;
  type: string; // highway tag
  width?: string;
  lanes?: string;
  maxspeed?: string;
  surface?: string;
}

export interface StreetAnalysis {
  streetName: string;
  isTruckSuitable: boolean;
  restrictionReason?: string;
  maxWeight?: string;
  streetWidth?: string; // New field from OSM/AI
  lanes?: string; // New field from OSM
  congestionScore: number; // 1-10
  congestionCurve: number[]; // Array of 12 integers (0-10) for 2h intervals starting 00:00
  rushHourTimes: string[];
  description: string;
  alternativeRoutes: string[];
  lastUpdated: string;
}

export interface RouteAnalysis {
  suitabilityScore: number; // 0 - 100
  isRouteSuitable: boolean;
  majorWarnings: string[];
  trafficPrediction: string;
  problematicStreets: string[];
  estimatedDurationAdjustment: string; // e.g. "+20 mins due to traffic"
}

export interface LiveTrafficData {
  summary: string;
  lastUpdated: string;
  sources: { title: string; uri: string }[];
}

export interface WeatherData {
  temp: string;
  condition: string;
  impact: string;
  isSevere: boolean;
}

export interface MapMarkerData {
  id: string;
  position: Coordinates;
  name: string;
  type: 'hotspot' | 'user-selected' | 'route-point';
  index?: number; // For route sequence
}