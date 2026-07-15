const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { rows } = await getPool().query(`SELECT * FROM uporabnik WHERE id = $1`, [req.query.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.status(200).json(rows[0]);
};
