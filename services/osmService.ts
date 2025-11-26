import { Coordinates, OsmStreetDetails } from "../types";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

export const getStreetGeometry = async (
  streetName: string,
  centerLat: number,
  centerLng: number
): Promise<Coordinates[][]> => {
  // Simple cleanup to ensure we search for the street name only
  const cleanName = streetName.split(',')[0].trim();

  // Overpass Query: Find ways with this name within 1000m of the point
  // We use a radius to avoid fetching the same street name from a different city district if applicable
  const query = `
    [out:json][timeout:10];
    (
      way["name"="${cleanName}"](around:1000,${centerLat},${centerLng});
    );
    out geom;
  `;

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    
    const segments: Coordinates[][] = [];
    
    if (data.elements) {
      data.elements.forEach((element: any) => {
        if (element.type === 'way' && element.geometry) {
          const path = element.geometry.map((pt: any) => ({
            lat: pt.lat,
            lng: pt.lon
          }));
          segments.push(path);
        }
      });
    }

    return segments;
  } catch (error) {
    console.error("OSM Geometry Fetch Error:", error);
    return [];
  }
};

export const getNearestStreetDetails = async (
  lat: number,
  lng: number
): Promise<OsmStreetDetails | null> => {
  // Query for the nearest way with a highway tag within 20 meters
  const query = `
    [out:json][timeout:5];
    way(around:20,${lat},${lng})["highway"];
    out tags center;
  `;

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    
    if (data.elements && data.elements.length > 0) {
      // Get the first element (closest usually, or arbitrary in circle)
      const element = data.elements[0];
      const tags = element.tags;
      
      return {
        name: tags.name || "Unnamed Road",
        type: tags.highway || "unknown",
        width: tags.width || tags.est_width || undefined,
        lanes: tags.lanes || undefined,
        maxspeed: tags.maxspeed || undefined,
        surface: tags.surface || undefined
      };
    }
    
    return null;

  } catch (error) {
    console.error("OSM Details Fetch Error:", error);
    return null;
  }
};