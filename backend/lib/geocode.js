const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy requires a real User-Agent and caps requests at ~1/sec —
// fine for occasional address lookups, but this endpoint should not be hit in a loop.
async function geocodeAddress(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=si&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'firehydrant-locator-expo' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

  const results = await res.json();
  if (!results.length) return null;
  return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
}

module.exports = { geocodeAddress };
