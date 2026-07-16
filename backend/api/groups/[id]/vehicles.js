const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { respondIfDbError } = require('../../../lib/dbError');
const { requireAuth } = require('../../../lib/auth');
const { requireRole, getMembership } = require('../../../lib/authz');

const VEHICLE_FIELDS = `id, skupina_id AS "skupinaId", ime, premer_cevi AS "premerCevi", created_at AS "createdAt"`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const groupId = req.query.id;

  if (req.method === 'POST') {
    const membership = await requireRole(res, user.id, groupId, ['admin']);
    if (!membership) return;

    const { ime, premerCevi } = req.body || {};
    if (!ime || !premerCevi) {
      return res.status(400).json({ error: 'ime and premerCevi are required' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO vozilo (skupina_id, ime, premer_cevi) VALUES ($1, $2, $3) RETURNING ${VEHICLE_FIELDS}`,
        [groupId, ime, premerCevi]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  // GET — any approved member can see the group's shared vehicles.
  const membership = await getMembership(user.id, groupId);
  if (!membership) return res.status(403).json({ error: 'forbidden' });

  const { rows } = await pool.query(`SELECT ${VEHICLE_FIELDS} FROM vozilo WHERE skupina_id = $1 ORDER BY created_at`, [
    groupId
  ]);
  res.status(200).json(rows);
};
