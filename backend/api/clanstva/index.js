const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { uporabnik_id, skupina_id, vloga, status } = req.body || {};
    if (!uporabnik_id || !skupina_id || !vloga || !status) {
      return res.status(400).json({ error: 'uporabnik_id, skupina_id, vloga and status are required' });
    }
    try {
      const { rows } = await getPool().query(
        `INSERT INTO clanstvo (uporabnik_id, skupina_id, vloga, status) VALUES ($1, $2, $3, $4) RETURNING *`,
        [uporabnik_id, skupina_id, vloga, status]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  const { skupina_id, uporabnik_id } = req.query;
  const conditions = [];
  const params = [];
  if (skupina_id) {
    params.push(skupina_id);
    conditions.push(`skupina_id = $${params.length}`);
  }
  if (uporabnik_id) {
    params.push(uporabnik_id);
    conditions.push(`uporabnik_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await getPool().query(`SELECT * FROM clanstvo ${where} ORDER BY created_at DESC`, params);
  res.status(200).json(rows);
};
