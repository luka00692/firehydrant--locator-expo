const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');
const { requireRole } = require('../../lib/authz');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const { rows } = await pool.query(`SELECT skupina_id FROM vozilo WHERE id = $1`, [req.query.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });

  const membership = await requireRole(res, user.id, rows[0].skupina_id, ['lastnik']);
  if (!membership) return;

  await pool.query(`DELETE FROM vozilo WHERE id = $1`, [req.query.id]);
  res.status(204).end();
};
