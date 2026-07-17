const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const DEFAULT_TIMEOUT_MS = 4000;

// The public OSRM demo server is rate-limited and occasionally slow/unreachable.
// Abort each call after a short timeout so one hung request can't stall the
// whole nearest-hydrant workflow (the caller falls back to straight-line).
async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'firehydrant-locator-expo' } });
  } finally {
    clearTimeout(timer);
  }
}

// Road distance/duration between two points, server-side — used to rank
// candidates by road distance instead of straight-line distance. No geometry
// here — cheap to call once per candidate.
async function fetchRoadRoute(from, to) {
  const url = `${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json();
  if (!data.routes?.length) return null;
  return { distance: data.routes[0].distance, duration: data.routes[0].duration };
}

// Same as fetchRoadRoute but also returns the route's line geometry, for
// drawing the path on a map. Only call this once, for the winning candidate —
// full geometry is too expensive to fetch for every candidate.
async function fetchRoadRouteWithGeometry(from, to) {
  const url = `${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json();
  if (!data.routes?.length) return null;
  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon])
  };
}

module.exports = { fetchRoadRoute, fetchRoadRouteWithGeometry };
