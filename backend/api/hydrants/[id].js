const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  const { rows } = await getPool().query(
    `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
     FROM hydrants WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.status(200).json(rows[0]);
};
