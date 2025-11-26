import { GoogleGenAI, Type, Schema, GenerateContentResponse } from "@google/genai";
import { StreetAnalysis, VehicleType, RouteAnalysis, LiveTrafficData, OsmStreetDetails, WeatherData } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    streetName: {
      type: Type.STRING,
      description: "The name of the street or area identified by the coordinates."
    },
    isTruckSuitable: {
      type: Type.BOOLEAN,
      description: "Whether the street is suitable/legal for the specified truck type."
    },
    restrictionReason: {
      type: Type.STRING,
      description: "Short reason for restriction (e.g., 'Width < 3m', 'Narrow lanes', 'Weight limit').",
      nullable: true
    },
    maxWeight: {
      type: Type.STRING,
      description: "Specific weight limit if known (e.g., '3.5t'), or null if standard.",
      nullable: true
    },
    streetWidth: {
      type: Type.STRING,
      description: "The physical width of the street if relevant (e.g., 'approx. 4m').",
      nullable: true
    },
    congestionScore: {
      type: Type.INTEGER,
      description: "A score from 1 (Clear) to 10 (Gridlock) based on typical conditions.",
    },
    congestionCurve: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description: "Array of 12 integers (1-10) representing typical congestion every 2 hours starting at 00:00 (e.g. [1,1,2,6,9,7,5,8,9,6,3,2])."
    },
    rushHourTimes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of time ranges when traffic is worst (e.g., '07:30 - 09:00')."
    },
    description: {
      type: Type.STRING,
      description: "A detailed 2-3 sentence analysis of the logistics conditions."
    },
    alternativeRoutes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Names of nearby streets that are wider or better suited for this vehicle."
    }
  },
  required: ["streetName", "isTruckSuitable", "congestionScore", "congestionCurve", "rushHourTimes", "description"],
};

const routeAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    suitabilityScore: {
      type: Type.INTEGER,
      description: "0 to 100 score. 100 is perfect."
    },
    isRouteSuitable: {
      type: Type.BOOLEAN,
      description: "Overall judgment if the route is viable."
    },
    majorWarnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Critical warnings like 'Bridge height < 3.8m' or 'Ban on LKW'."
    },
    trafficPrediction: {
      type: Type.STRING,
      description: "Prediction of traffic flow for this specific route composition."
    },
    problematicStreets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of specific street names from the input that are problematic."
    },
    estimatedDurationAdjustment: {
      type: Type.STRING,
      description: "Estimated delay string e.g., '+15 mins' based on congestion."
    }
  },
  required: ["suitabilityScore", "isRouteSuitable", "majorWarnings", "trafficPrediction", "problematicStreets"]
};

// Retry helper for 429 errors
async function retryGeminiCall<T>(
  operation: () => Promise<T>,
  maxRetries: number = 4,
  baseDelay: number = 2500
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isRateLimit && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`Gemini rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error; // Not a rate limit or max retries reached
    }
  }
  throw lastError;
}

export const analyzeStreetConditions = async (
  lat: number,
  lng: number,
  vehicleType: VehicleType,
  osmData?: OsmStreetDetails | null
): Promise<StreetAnalysis> => {
  const model = "gemini-2.5-flash";

  let physicalContext = "";
  if (osmData) {
    physicalContext = `
      Verified Physical Data from OpenStreetMap:
      - Street Name: ${osmData.name}
      - Highway Type: ${osmData.type}
      - Width: ${osmData.width ? osmData.width + ' meters' : 'Not specified'}
      - Lanes: ${osmData.lanes ? osmData.lanes : 'Not specified'}
      
      CRITICAL INSTRUCTION: Use the 'Width' data above if available. 
      - Heavy LKW needs at least 3.0m width per lane or >5.5m total for two-way. 
      - If width is less than 3.5m, mark isTruckSuitable as FALSE for LKW_HEAVY.
      - If lanes < 2 and type is residential, warn about passing difficulties.
    `;
  }

  const prompt = `
    Analyze the traffic and logistical suitability for a vehicle of type "${vehicleType}" at the coordinates: Latitude ${lat}, Longitude ${lng} in Cologne (Köln), Germany.
    
    ${physicalContext}
    
    Consider:
    1. Physical constraints (narrow streets, width limits, bridge heights).
    2. Legal restrictions (Umweltzone, weight limits).
    3. Typical traffic patterns.
    4. Alternative Routes: If the street is physically too narrow or restricted, explicitly suggest wider, main roads nearby.
    
    Provide a realistic assessment including a 24-hour congestion curve (12 points).
  `;

  try {
    const response = await retryGeminiCall<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are an expert logistics coordinator for Cologne. You strictly check street widths against vehicle requirements."
      },
    }));

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const data = JSON.parse(text) as Omit<StreetAnalysis, 'lastUpdated'>;
    
    return {
      ...data,
      // Fallback: If AI didn't return width but OSM did, inject OSM width into the UI model
      streetWidth: data.streetWidth || (osmData?.width ? `${osmData.width}m` : undefined),
      lanes: osmData?.lanes,
      // Fallback for congestion curve if AI fails to generate array (though schema enforces it)
      congestionCurve: data.congestionCurve?.length === 12 ? data.congestionCurve : [2,2,3,7,9,6,5,8,9,5,3,2],
      lastUpdated: new Date().toLocaleTimeString(),
    };

  } catch (error: any) {
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED');
    
    if (isRateLimit) {
      console.warn("Gemini Service Quota Exceeded. Returning fallback data.");
      return {
        streetName: osmData?.name || "Service Busy (High Traffic)",
        isTruckSuitable: true, // Optimistic default if we can't check
        restrictionReason: "AI Analysis unavailable. Check local signs.",
        streetWidth: osmData?.width ? `${osmData.width}m` : "Unknown",
        lanes: osmData?.lanes,
        congestionScore: 5, // Neutral score
        congestionCurve: [2,2,2,5,5,5,5,5,5,5,2,2], // Flat curve
        rushHourTimes: ["Unknown"],
        description: "The AI analysis service is currently experiencing high demand. Please rely on standard physical street data and local signage. This street has not been fully verified for logistical constraints at this moment.",
        alternativeRoutes: [],
        lastUpdated: new Date().toLocaleTimeString(),
      };
    }

    console.error("Gemini Analysis Failed:", error);
    return {
      streetName: osmData?.name || "Analysis Failed",
      isTruckSuitable: false,
      congestionScore: 0,
      congestionCurve: [0,0,0,0,0,0,0,0,0,0,0,0],
      rushHourTimes: [],
      description: "Could not retrieve data from AI service. Please check API key configuration.",
      alternativeRoutes: [],
      lastUpdated: new Date().toLocaleTimeString(),
    };
  }
};

export const analyzeRouteLogistics = async (
  vehicleType: VehicleType,
  streetNames: string[]
): Promise<RouteAnalysis> => {
  const model = "gemini-2.5-flash";
  
  const prompt = `
    Analyze the following route in Cologne (Köln) for a "${vehicleType}".
    
    Route includes these streets: ${streetNames.join(", ")}.
    
    Identify:
    1. Streets illegal or physically impossible for this vehicle (e.g., pedestrian zones, low bridges, weight limits).
    2. Heavy congestion areas typical for Cologne.
    3. Give a suitability score (0-100).
  `;

  try {
    const response = await retryGeminiCall<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: routeAnalysisSchema,
        systemInstruction: "You are an expert logistics router for Cologne. Be strict about truck bans in the inner city and bridge heights."
      }
    }));

    const text = response.text;
    if (!text) throw new Error("No response");
    
    return JSON.parse(text) as RouteAnalysis;

  } catch (error: any) {
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED');
    
    if (isRateLimit) {
      console.warn("Route Analysis Quota Exceeded. Returning fallback.");
      return {
        suitabilityScore: 50,
        isRouteSuitable: true, // Optimistic
        majorWarnings: ["AI Service Busy - Verification Incomplete"],
        trafficPrediction: "Unknown (Service Busy)",
        problematicStreets: [],
        estimatedDurationAdjustment: "Unknown"
      };
    }

    console.error("Route Analysis Failed:", error);
    return {
      suitabilityScore: 0,
      isRouteSuitable: false,
      majorWarnings: ["AI Analysis Service Unavailable"],
      trafficPrediction: "Unknown",
      problematicStreets: [],
      estimatedDurationAdjustment: "Unknown"
    };
  }
};

export const getLiveTrafficUpdates = async (queryContext: string): Promise<LiveTrafficData> => {
  const model = "gemini-2.5-flash";

  const prompt = `
    Find the latest real-time traffic reports, accidents, roadworks, or congestion warnings for: ${queryContext}.
    
    Focus on Cologne (Köln), Germany. 
    Summarize any active incidents or major jams in 2-3 concise bullet points. 
    If there are no major incidents reported recently, say "No major live incidents reported."
  `;

  try {
    const response = await retryGeminiCall<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType and responseSchema are NOT allowed with googleSearch
      }
    }));

    const text = response.text || "No live data available.";
    
    const sources: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || "Source",
            uri: chunk.web.uri
          });
        }
      });
    }

    return {
      summary: text,
      lastUpdated: new Date().toLocaleTimeString(),
      sources: sources
    };

  } catch (error: any) {
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED');
    
    if (isRateLimit) {
      console.warn("Live Traffic Fetch Quota Exceeded.");
      return {
        summary: "Live traffic updates temporarily unavailable due to high service demand. Please drive carefully.",
        lastUpdated: new Date().toLocaleTimeString(),
        sources: []
      };
    }

    console.error("Live Traffic Fetch Failed:", error);
    return {
      summary: "Unable to fetch live traffic data at this time.",
      lastUpdated: new Date().toLocaleTimeString(),
      sources: []
    };
  }
};

export const getWeatherLogistics = async (): Promise<WeatherData> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    Find the current weather in Cologne (Köln), Germany.
    Return a response that STRICTLY follows this format (do not use markdown blocks):
    TEMP: [Temperature e.g. 15°C]
    COND: [Condition e.g. Rainy]
    IMPACT: [1 short sentence on how this affects road safety/logistics]
    SEVERE: [YES or NO]
  `;

  try {
    // Specific retries for weather, it is lower priority so we can accept failure faster if needed
    const response = await retryGeminiCall<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    }), 2, 2000); 

    const text = response.text || "";
    
    // Parse the structured text response
    const tempMatch = text.match(/TEMP:\s*(.*)/i);
    const condMatch = text.match(/COND:\s*(.*)/i);
    const impactMatch = text.match(/IMPACT:\s*(.*)/i);
    const severeMatch = text.match(/SEVERE:\s*(.*)/i);

    return {
      temp: tempMatch ? tempMatch[1].trim() : "N/A",
      condition: condMatch ? condMatch[1].trim() : "Unknown",
      impact: impactMatch ? impactMatch[1].trim() : "Weather data unavailable.",
      isSevere: severeMatch ? severeMatch[1].trim().toUpperCase().includes("YES") : false
    };

  } catch (error: any) {
    // Graceful handling for 429 to avoid scaring users for background weather fetch
    if (error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn("Weather fetch skipped due to quota limits.");
    } else {
      console.error("Weather Fetch Failed:", error);
    }
    
    return {
      temp: "--",
      condition: "Unavailable",
      impact: "Could not fetch weather data.",
      isSevere: false
    };
  }
};
