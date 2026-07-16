const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

// Road distance/duration between two points, server-side — the mobile app
// used to call OSRM directly (src/routing.js); the /api/hydrants/nearest
// workflow needs the same thing from the backend to rank candidates by road
// distance instead of straight-line distance.
async function fetchRoadRoute(from, to) {
  const url = `${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json();
  if (!data.routes?.length) return null;
  return { distance: data.routes[0].distance, duration: data.routes[0].duration };
}

module.exports = { fetchRoadRoute };
