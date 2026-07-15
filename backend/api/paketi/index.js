const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { kupec_id, skupina_id, tip, st_sedezev } = req.body || {};
    if (!kupec_id || !skupina_id || !tip || !st_sedezev) {
      return res.status(400).json({ error: 'kupec_id, skupina_id, tip and st_sedezev are required' });
    }
    try {
      const { rows } = await getPool().query(
        `INSERT INTO paket (kupec_id, skupina_id, tip, st_sedezev) VALUES ($1, $2, $3, $4) RETURNING *`,
        [kupec_id, skupina_id, tip, st_sedezev]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  const { skupina_id } = req.query;
  const { rows } = skupina_id
    ? await getPool().query(`SELECT * FROM paket WHERE skupina_id = $1 ORDER BY created_at DESC`, [skupina_id])
    : await getPool().query(`SELECT * FROM paket ORDER BY created_at DESC`);
  res.status(200).json(rows);
};
