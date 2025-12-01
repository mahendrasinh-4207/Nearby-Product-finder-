import { GoogleGenAI, Type } from "@google/genai";
import { ProductInfo, Shop, OnlineStore, UserLocation, SimilarProduct } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper function to convert File to Gemini's format
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

const parseJsonResponse = <T,>(text: string): T | null => {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      return JSON.parse(match[1]) as T;
    }
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
        startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
        startIdx = firstBrace;
    } else {
        startIdx = firstBracket;
    }
    if (startIdx === -1) return null;
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);
    if (endIdx === -1) return null;
    const jsonString = text.substring(startIdx, endIdx + 1);
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error("Failed to parse JSON:", text, error);
    return null;
  }
};

export const identifyProduct = async (imageFile: File): Promise<{ name: string; type: string } | null> => {
  try {
    const imagePart = await fileToGenerativePart(imageFile);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                imagePart,
                { text: `Identify the product in this image. Respond with a JSON object containing 'name' and 'type'. For example: {"name": "Sony WH-1000XM4 Headphones", "type": "Electronics"}` }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING }
                },
                required: ["name", "type"]
            }
        }
    });
    return parseJsonResponse<{ name: string; type: string }>(response.text);
  } catch (error) {
    console.error("Error identifying product:", error);
    return null;
  }
};

export const getProductDetails = async (productName: string): Promise<Omit<ProductInfo, 'name' | 'type'> | null> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Provide details for the product "${productName}". Respond with a JSON object containing 'keyFeatures' (an array of the 1-2 most important, concise features), and 'approximatePrice' (a string representing the typical price range, e.g., "$100 - $150").`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    keyFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
                    approximatePrice: { type: Type.STRING }
                },
                required: ["keyFeatures", "approximatePrice"]
            }
        }
    });
    return parseJsonResponse<Omit<ProductInfo, 'name' | 'type'>>(response.text);
  } catch (error) {
    console.error("Error getting product details:", error);
    return null;
  }
};

export const findNearbyShops = async (productName: string, productType: string, location: UserLocation): Promise<Shop[] | null> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Find up to 5 physical stores within a 20km radius of my location likely to sell "${productName}". If exact matches are scarce, search for stores selling similar products of type "${productType}". Respond *only* with a JSON array of objects in a JSON code block. Each object must have 'name', 'address', 'distance' (string from my location), 'rating' (a number from 1 to 5), and 'availabilityScore' (a number from 0 to 1 representing the probability of it being in stock). If no stores are found, return an empty array [].`,
        config: {
            tools: [{ googleMaps: {} }],
            toolConfig: {
                retrievalConfig: {
                    latLng: {
                        latitude: location.latitude,
                        longitude: location.longitude
                    }
                }
            },
        }
    });
    return parseJsonResponse<Shop[]>(response.text);
  } catch (error) {
    console.error("Error finding nearby shops:", error);
    return null;
  }
};

export const findOnlineStores = async (productName: string): Promise<OnlineStore[] | null> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Find online stores selling "${productName}". Prioritize major platforms like Amazon, Flipkart, Meesho, and Blinkit if relevant. Respond *only* with a JSON array of objects in a JSON code block. Each object must have 'platform', 'price' (string), 'stockStatus' ('In Stock', 'Out of Stock', etc.), and a direct 'url' to the product page. If no online stores are found, return an empty array [].`,
        config: {
            tools: [{ googleSearch: {} }],
        }
    });
    return parseJsonResponse<OnlineStore[]>(response.text);
  } catch (error) {
    console.error("Error finding online stores:", error);
    return null;
  }
};

export const findSimilarProducts = async (productName: string): Promise<Array<{name: string, imageUrl?: string}> | null> => {
    try {
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Find up to 6 products visually similar or related to "${productName}". Respond *only* with a JSON array of objects in a JSON code block. Each object must contain 'name'. It should also contain 'imageUrl' from Google Search results if a high-quality, publicly accessible image URL is available. If not, omit the 'imageUrl' field. If no similar products are found, return an empty array [].`,
          config: {
              tools: [{ googleSearch: {} }],
          }
      });
      return parseJsonResponse<Array<{name: string, imageUrl?: string}>>(response.text);
    } catch (error) {
      console.error("Error finding similar products:", error);
      return null;
    }
};

export const generateProductImage = async (productName: string): Promise<string | null> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `A professional, clean, high-resolution product photograph of "${productName}" on a plain white studio background. The product should be centered, well-lit, and the only object in the image.`,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: '1:1',
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
        return null;
    } catch (error) {
        console.error(`Error generating product image for "${productName}":`, error);
        return null;
    }
};