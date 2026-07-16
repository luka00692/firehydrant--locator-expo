const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { respondIfDbError } = require('../../../lib/dbError');
const { requireAuth } = require('../../../lib/auth');
const { requireRole, getMembership } = require('../../../lib/authz');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const groupId = req.query.id;

  if (req.method === 'POST') {
    const membership = await requireRole(res, user.id, groupId, ['lastnik']);
    if (!membership) return;

    const { ime, premer_cevi } = req.body || {};
    if (!ime || !premer_cevi) {
      return res.status(400).json({ error: 'ime and premer_cevi are required' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO vozilo (skupina_id, ime, premer_cevi) VALUES ($1, $2, $3) RETURNING *`,
        [groupId, ime, premer_cevi]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  // GET — any active member can see the group's shared vehicles.
  const membership = await getMembership(user.id, groupId);
  if (!membership) return res.status(403).json({ error: 'forbidden' });

  const { rows } = await pool.query(`SELECT * FROM vozilo WHERE skupina_id = $1 ORDER BY created_at`, [groupId]);
  res.status(200).json(rows);
};
