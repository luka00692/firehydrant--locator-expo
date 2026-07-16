import { API_BASE_URL } from './config';

export async function fetchHydrantsInBounds(bounds) {
  const { minLat, minLon, maxLat, maxLon } = bounds;
  const url = `${API_BASE_URL}/api/hydrants?minLat=${minLat}&minLon=${minLon}&maxLat=${maxLat}&maxLon=${maxLon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchNearestHydrant(point) {
  const url = `${API_BASE_URL}/api/hydrants/nearby?lat=${point.latitude}&lon=${point.longitude}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}
