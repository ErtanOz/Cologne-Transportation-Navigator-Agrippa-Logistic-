import { Coordinates } from "../types";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";

export const geocodeStreet = async (streetName: string): Promise<Coordinates | null> => {
  try {
    const params = new URLSearchParams({
      q: `${streetName}, Köln, Germany`,
      format: "json",
      limit: "1",
    });

    const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`);
    if (!response.ok) throw new Error("Geocoding failed");

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
};
