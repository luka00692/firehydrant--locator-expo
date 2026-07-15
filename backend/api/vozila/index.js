const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { skupina_id, ime, premer_cevi } = req.body || {};
    if (!skupina_id || !ime || !premer_cevi) {
      return res.status(400).json({ error: 'skupina_id, ime and premer_cevi are required' });
    }
    try {
      const { rows } = await getPool().query(
        `INSERT INTO vozilo (skupina_id, ime, premer_cevi) VALUES ($1, $2, $3) RETURNING *`,
        [skupina_id, ime, premer_cevi]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  const { skupina_id } = req.query;
  const { rows } = skupina_id
    ? await getPool().query(`SELECT * FROM vozilo WHERE skupina_id = $1 ORDER BY created_at DESC`, [skupina_id])
    : await getPool().query(`SELECT * FROM vozilo ORDER BY created_at DESC`);
  res.status(200).json(rows);
};
