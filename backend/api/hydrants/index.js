const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');

// Hydrants within a map viewport, so clients don't fetch the whole country at once.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { minLat, minLon, maxLat, maxLon } = req.query;
  if ([minLat, minLon, maxLat, maxLon].some((v) => v === undefined)) {
    return res.status(400).json({ error: 'minLat, minLon, maxLat, maxLon are required' });
  }

  const { rows } = await getPool().query(
    `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
     FROM hydrants
     WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography`,
    [Number(minLon), Number(minLat), Number(maxLon), Number(maxLat)]
  );
  res.status(200).json(rows);
};
