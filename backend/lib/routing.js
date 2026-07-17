// Pluggable road-routing layer. Picks a provider from env at call time:
//   - OpenRouteService   if ORS_API_KEY is set
//   - Mapbox Directions  if MAPBOX_TOKEN is set
//   - OSRM demo server   otherwise (keyless fallback; rate-limited)
// Set OSRM_URL to point at a self-hosted OSRM instead of the public demo.
// All providers return the same shapes so api/hydrants/nearest.js is unchanged:
//   ranking call     -> { distance, duration }
//   geometry call    -> { distance, duration, coordinates:[[lat,lon]...], steps:[{text,distance}] }
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org/route/v1/driving';
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
const MAPBOX_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const DEFAULT_TIMEOUT_MS = 5000;

function activeProvider() {
  if (process.env.ORS_API_KEY) return 'ors';
  if (process.env.MAPBOX_TOKEN) return 'mapbox';
  return 'osrm';
}

// Abort each call after a short timeout so one hung/slow request can't stall the
// whole nearest-hydrant workflow (the caller falls back to straight-line).
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': 'firehydrant-locator-expo', ...(options.headers || {}) }
    });
  } finally {
    clearTimeout(timer);
  }
}

// --- Instruction formatting -------------------------------------------------

// OSRM and Mapbox share the same maneuver model (type + modifier + street name),
// so one formatter turns either into a short Slovenian instruction.
const DIR = {
  left: 'levo',
  right: 'desno',
  'slight left': 'rahlo levo',
  'slight right': 'rahlo desno',
  'sharp left': 'ostro levo',
  'sharp right': 'ostro desno',
  straight: 'naravnost',
  uturn: 'nazaj (polkrožno)'
};

function formatManeuver(step) {
  const m = step.maneuver || {};
  const road = step.name ? ` na ${step.name}` : '';
  const dir = DIR[m.modifier] || m.modifier || '';
  switch (m.type) {
    case 'depart':
      return `Začni pot${road}`;
    case 'arrive':
      return 'Prihod do hidranta';
    case 'turn':
      return `Zavij ${dir}${road}`.trim();
    case 'continue':
      return `Nadaljuj ${dir || 'naravnost'}${road}`.trim();
    case 'new name':
      return `Nadaljuj${road}`;
    case 'merge':
      return `Priključi se${road}`;
    case 'ramp':
    case 'on ramp':
      return `Zapelji na uvoz${road}`;
    case 'off ramp':
      return `Zapelji na izvoz${road}`;
    case 'fork':
      return `Na razcepu ${dir || 'naravnost'}${road}`.trim();
    case 'end of road':
      return `Na koncu ceste zavij ${dir}${road}`.trim();
    case 'roundabout':
    case 'rotary':
      return `V krožišču izberi ${m.exit ? `${m.exit}. izhod` : 'izhod'}${road}`;
    default:
      return `Nadaljuj${road}`;
  }
}

// OpenRouteService uses numeric instruction type codes instead of maneuvers.
const ORS_TYPE = {
  0: 'Zavij levo',
  1: 'Zavij desno',
  2: 'Zavij ostro levo',
  3: 'Zavij ostro desno',
  4: 'Zavij rahlo levo',
  5: 'Zavij rahlo desno',
  6: 'Nadaljuj naravnost',
  7: 'Zapelji v krožišče',
  8: 'Zapusti krožišče',
  9: 'Obrni se (U-obrat)',
  10: 'Začni pot',
  11: 'Prihod do hidranta',
  12: 'Zavij rahlo levo',
  13: 'Zavij rahlo desno'
};

function formatOrsStep(step) {
  const base = ORS_TYPE[step.type] ?? 'Nadaljuj';
  const road = step.name && step.name !== '-' ? ` na ${step.name}` : '';
  return `${base}${road}`;
}

// --- Providers --------------------------------------------------------------

async function osrmDirections(from, to, withGeometry) {
  const q = withGeometry ? 'overview=full&geometries=geojson&steps=true' : 'overview=false';
  const url = `${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?${q}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();
  if (!data.routes?.length) return null;
  const route = data.routes[0];
  if (!withGeometry) return { distance: route.distance, duration: route.duration };
  const steps = (route.legs?.[0]?.steps || [])
    .map((s) => ({ text: formatManeuver(s), distance: s.distance }))
    .filter((s) => s.text);
  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    steps
  };
}

async function mapboxDirections(from, to, withGeometry) {
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const params = new URLSearchParams({
    access_token: process.env.MAPBOX_TOKEN,
    geometries: 'geojson',
    overview: withGeometry ? 'full' : 'false',
    steps: withGeometry ? 'true' : 'false',
    language: 'sl'
  });
  const res = await fetchWithTimeout(`${MAPBOX_URL}/${coords}?${params.toString()}`);
  if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);
  const data = await res.json();
  if (!data.routes?.length) return null;
  const route = data.routes[0];
  if (!withGeometry) return { distance: route.distance, duration: route.duration };
  const steps = (route.legs?.[0]?.steps || [])
    // Mapbox returns localized prose in maneuver.instruction; fall back to our
    // own formatter (same maneuver model as OSRM) if it's missing.
    .map((s) => ({ text: s.maneuver?.instruction || formatManeuver(s), distance: s.distance }))
    .filter((s) => s.text);
  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    steps
  };
}

async function orsDirections(from, to, withGeometry) {
  const res = await fetchWithTimeout(`${ORS_URL}/geojson`, {
    method: 'POST',
    headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: [
        [from.lon, from.lat],
        [to.lon, to.lat]
      ],
      instructions: withGeometry
    })
  });
  if (!res.ok) throw new Error(`ORS HTTP ${res.status}`);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;
  const summary = feature.properties?.summary || {};
  if (!withGeometry) return { distance: summary.distance, duration: summary.duration };
  const steps = [];
  for (const segment of feature.properties?.segments || []) {
    for (const step of segment.steps || []) {
      steps.push({ text: formatOrsStep(step), distance: step.distance });
    }
  }
  return {
    distance: summary.distance,
    duration: summary.duration,
    coordinates: (feature.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]),
    steps
  };
}

function directions(from, to, withGeometry) {
  switch (activeProvider()) {
    case 'ors':
      return orsDirections(from, to, withGeometry);
    case 'mapbox':
      return mapboxDirections(from, to, withGeometry);
    default:
      return osrmDirections(from, to, withGeometry);
  }
}

// --- Public API (unchanged signatures) --------------------------------------

// Road distance/duration between two points — used to rank candidates by road
// distance. Cheap: no geometry.
async function fetchRoadRoute(from, to) {
  const r = await directions(from, to, false);
  return r ? { distance: r.distance, duration: r.duration } : null;
}

// Distance/duration plus line geometry and step-by-step instructions, for the
// winning candidate only.
function fetchRoadRouteWithGeometry(from, to) {
  return directions(from, to, true);
}

module.exports = { fetchRoadRoute, fetchRoadRouteWithGeometry, activeProvider };
