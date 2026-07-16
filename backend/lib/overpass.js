const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const SLOVENIA_HYDRANTS_QUERY = `[out:json][timeout:60];
area["ISO3166-1"="SI"][admin_level=2]->.si;
node["emergency"="fire_hydrant"](area.si);
out body;`;

// Returns features shaped like importHydrants() expects (id, geometry.coordinates, properties),
// so a resync can reuse the exact same upsert logic as the one-time GeoJSON import.
async function fetchSloveniaHydrants() {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(SLOVENIA_HYDRANTS_QUERY)}`
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  const data = await res.json();
  return data.elements.map((el) => ({
    id: el.id,
    geometry: { coordinates: [el.lon, el.lat] },
    properties: el.tags || {}
  }));
}

module.exports = { fetchSloveniaHydrants };
