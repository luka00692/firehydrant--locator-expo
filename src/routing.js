export async function fetchRoute(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (!data.routes?.length) throw new Error('no route found');

  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
    distance: route.distance,
    duration: route.duration
  };
}
