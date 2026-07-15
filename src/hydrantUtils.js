export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function formatMinutes(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min${mins === 1 ? '' : 's'}`;
}

export function hydrantLabel(props) {
  if (props?.name) return props.name;
  if (props?.ref) return `Hydrant ${props.ref}`;
  if (props?.['addr:street']) return `Hydrant — ${props['addr:street']}`;
  return 'Fire hydrant';
}

// OSM tags this as a plain nominal-diameter number in mm (e.g. "80", "100").
// Occasional bad data (e.g. "H80") is shown as-is rather than guessed at.
export function diameterSummary(props) {
  const d = props?.['fire_hydrant:diameter'];
  if (!d) return null;
  return /^\d+$/.test(d) ? `DN ${d} mm` : d;
}

// "couplings" is an outlet count, "couplings:type" is the standard (usually Storz),
// "couplings:diameters" is a ; separated list of Storz size letters per outlet.
export function couplingsSummary(props) {
  const parts = [];
  if (props?.couplings) {
    const n = parseInt(props.couplings, 10);
    parts.push(!isNaN(n) ? `${n} outlet${n === 1 ? '' : 's'}` : `${props.couplings} outlets`);
  }
  if (props?.['couplings:type']) parts.push(props['couplings:type']);
  if (props?.['couplings:diameters']) {
    parts.push(`sizes ${props['couplings:diameters'].split(/;\s*/).join(', ')}`);
  }
  return parts.length ? parts.join(' — ') : null;
}

export function findNearest(point, hydrants) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const hydrant of hydrants) {
    const dist = haversineMeters(point, hydrant.coordinate);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = hydrant;
    }
  }
  return nearest ? { hydrant: nearest, distance: nearestDist } : null;
}

export function detailCompleteness(props) {
  const hasDiameter = !!diameterSummary(props);
  const hasCouplings = !!couplingsSummary(props);
  if (hasDiameter && hasCouplings) return 'full';
  if (hasDiameter || hasCouplings) return 'partial';
  return 'none';
}

// OSM's fire_hydrant:type is "pillar", "underground", "wall", or "pipe".
// Everything except "underground" reads as a normal above-ground hydrant.
export function typeCategory(props) {
  const t = props?.['fire_hydrant:type'];
  if (!t) return 'unknown';
  return t.toLowerCase() === 'underground' ? 'underground' : 'aboveground';
}

// [tag key, human label] for the optional detail rows shown when tagged.
export const POPUP_FIELDS = [
  ['fire_hydrant:type', 'Type'],
  ['colour', 'Colour'],
  ['water_source', 'Water source'],
  ['fire_hydrant:position', 'Position'],
  ['fire_hydrant:pressure', 'Pressure'],
  ['addr:street', 'Street'],
  ['ref', 'Reference'],
  ['source', 'Source']
];
