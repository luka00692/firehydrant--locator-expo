const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { fetchRoadRoute, fetchRoadRouteWithGeometry } = require('../../lib/routing');
const { geocodeAddress } = require('../../lib/geocode');

const CANDIDATE_LIMIT = 5;

// Straight-line (great-circle) distance in metres — used as a guaranteed
// fallback when road routing (OSRM) is unavailable, so the client always has a
// distance to show and a line to draw.
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Takes the N nearest-as-crow-flies hydrants (optionally filtered by an exact
// fire_hydrant:diameter match for the selected vehicle's hose), road-routes
// each via OSRM, and returns whichever is actually closest by road — not
// just closest in a straight line. Route geometry (for drawing the path) is
// only fetched once, for the winning candidate.
//
// Accepts either {lat, lng} directly, or {address} — folded in here (rather
// than a separate /api/geocode route) to keep the Hobby plan's 12-function
// deploy cap, see backend/README.md TODO. When given an address, the
// geocoded point is echoed back as `point` so the caller can place a pin.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  let { lat, lng, premer, address, hydrantId } = req.body || {};
  let point;
  if (address) {
    try {
      point = await geocodeAddress(address);
    } catch (err) {
      return res.status(502).json({ error: 'geocoding failed', detail: err.message });
    }
    if (!point) return res.status(404).json({ error: 'address not found' });
    lat = point.lat;
    lng = point.lon;
  } else if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng, or address, are required' });
  }

  let candidates;
  if (hydrantId !== undefined) {
    // Route to this exact hydrant (e.g. the one just clicked on the map) —
    // skip the nearest-candidates search entirely so we don't silently
    // substitute a different, closer one.
    const { rows } = await getPool().query(
      `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties FROM hydrants WHERE id = $1`,
      [hydrantId]
    );
    candidates = rows;
  } else {
    const params = [Number(lat), Number(lng)];
    let diameterFilter = '';
    if (premer !== undefined) {
      params.push(String(premer));
      diameterFilter = `AND properties->>'fire_hydrant:diameter' = $${params.length}`;
    }
    params.push(CANDIDATE_LIMIT);

    const { rows } = await getPool().query(
      `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
       FROM hydrants
       WHERE true ${diameterFilter}
       ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       LIMIT $${params.length}`,
      params
    );
    candidates = rows;
  }

  if (!candidates.length) {
    return res.status(404).json({ error: hydrantId !== undefined ? 'hydrant not found' : 'no matching hydrant found' });
  }

  const from = { lat: Number(lat), lon: Number(lng) };
  let best = null;
  for (const candidate of candidates) {
    try {
      const route = await fetchRoadRoute(from, { lat: candidate.lat, lon: candidate.lon });
      if (route && (!best || route.distance < best.route.distance)) {
        best = { hydrant: candidate, route };
      }
    } catch {
      // OSRM failed for this one candidate — try the rest rather than aborting.
    }
  }

  // Road routing unavailable for every candidate — fall back to the closest
  // straight-line match with a great-circle distance and a direct line to draw,
  // instead of failing the whole request or returning nothing to show.
  if (!best) {
    const hydrant = candidates[0];
    const to = { lat: Number(hydrant.lat), lon: Number(hydrant.lon) };
    return res.status(200).json({
      hydrant,
      route: {
        distance: haversineMeters(from, to),
        duration: null,
        coordinates: [
          [from.lat, from.lon],
          [to.lat, to.lon]
        ],
        straightLine: true
      },
      point
    });
  }

  const to = { lat: Number(best.hydrant.lat), lon: Number(best.hydrant.lon) };
  try {
    const withGeometry = await fetchRoadRouteWithGeometry(from, to);
    if (withGeometry) best.route = withGeometry;
  } catch {
    // keep the distance/duration we already have, just without a line to draw
  }
  best.route.straightLine = false;
  // Road distance/duration is known but geometry fetch failed — still give the
  // client a line (direct) so the route renders.
  if (!best.route.coordinates) {
    best.route.coordinates = [
      [from.lat, from.lon],
      [to.lat, to.lon]
    ];
  }

  res.status(200).json({ ...best, point });
};
