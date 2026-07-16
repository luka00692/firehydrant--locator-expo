// Set EXPO_PUBLIC_API_BASE_URL in a .env file to point at your backend
// (e.g. your machine's LAN IP when testing on a physical device via Expo Go).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Only used by the web build's map (see src/Map.web.js) — react-native-maps
// on iOS/Android uses the platform's native map SDK instead.
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
