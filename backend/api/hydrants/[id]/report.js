const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { respondIfDbError } = require('../../../lib/dbError');

const MAX_MESSAGE_LENGTH = 2000;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  const sporocilo = (req.body || {}).sporocilo;
  if (typeof sporocilo !== 'string' || !sporocilo.trim()) {
    return res.status(400).json({ error: 'sporocilo is required' });
  }

  try {
    const { rows } = await getPool().query(
      `INSERT INTO hydrant_report (hydrant_id, sporocilo) VALUES ($1, $2) RETURNING *`,
      [id, sporocilo.trim().slice(0, MAX_MESSAGE_LENGTH)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (respondIfDbError(res, err)) return;
    throw err;
  }
};
