export enum AppStep {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR',
}

// To manage views within the RESULTS step
export enum ResultView {
  DETAILS = 'DETAILS',
  NEARBY = 'NEARBY',
  ONLINE = 'ONLINE',
  SIMILAR = 'SIMILAR',
}

export interface ProductInfo {
  name: string;
  type: string;
  keyFeatures: string[]; // Changed from specifications for conciseness
  approximatePrice: string;
}

export interface Shop {
  name: string;
  address: string;
  distance: string;
  availabilityScore: number;
  rating: number; // Added rating
}

export interface OnlineStore {
  platform: string;
  price: string;
  stockStatus: string;
  url: string;
}

export interface SimilarProduct {
  name: string;
  imageUrl: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
