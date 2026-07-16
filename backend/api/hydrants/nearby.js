const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');

// Nearest hydrants to a point, ordered via the GIST index (<->) instead of scanning in JS.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { lat, lon } = req.query;
  if (lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);

  const { rows } = await getPool().query(
    `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties,
            ST_Distance(geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance
     FROM hydrants
     ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
     LIMIT $3`,
    [Number(lat), Number(lon), limit]
  );
  res.status(200).json(rows);
};
