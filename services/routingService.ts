import { Coordinates } from "../types";

const OSRM_API_BASE = "https://router.project-osrm.org/route/v1";

export interface RouteResult {
  geometry: any; // GeoJSON
  coordinates: [number, number][]; // [lat, lng] for Leaflet
  streetNames: string[];
  duration: number; // seconds
  distance: number; // meters
}

export const calculateRoute = async (points: Coordinates[]): Promise<RouteResult> => {
  if (points.length < 2) {
    throw new Error("At least two points are required for a route.");
  }

  // Format coordinates for OSRM: lng,lat;lng,lat
  const coordString = points
    .map((p) => `${p.lng},${p.lat}`)
    .join(";");

  const url = `${OSRM_API_BASE}/driving/${coordString}?overview=full&geometries=geojson&steps=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Routing service error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error("No route found.");
    }

    const route = data.routes[0];
    const geometry = route.geometry;
    
    // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
    const coordinates: [number, number][] = geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);

    // Extract unique street names from steps
    const streetNames = new Set<string>();
    route.legs.forEach((leg: any) => {
      leg.steps.forEach((step: any) => {
        if (step.name && step.name.length > 0) {
          streetNames.add(step.name);
        }
      });
    });

    return {
      geometry,
      coordinates,
      streetNames: Array.from(streetNames),
      duration: route.duration,
      distance: route.distance
    };

  } catch (error) {
    console.error("Routing failed:", error);
    throw error;
  }
};
