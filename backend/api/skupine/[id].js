const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');

const SELECT_FIELDS = `id, lastnik_id, ime, st_sedezev, created_at,
  ST_Y(lokacija_doma::geometry) AS lat, ST_X(lokacija_doma::geometry) AS lon`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { rows } = await getPool().query(`SELECT ${SELECT_FIELDS} FROM skupina WHERE id = $1`, [req.query.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.status(200).json(rows[0]);
};
