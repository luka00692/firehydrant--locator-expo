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
  const { vehicleId } = req.query;

  // PATCH/DELETE target a specific vehicle (?vehicleId=...) — folded in here
  // (rather than a separate /api/vehicles/:id route) to keep the Hobby
  // plan's 12-function deploy cap, see backend/README.md TODO.
  if (vehicleId && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const { rows: existing } = await pool.query(`SELECT skupina_id FROM vozilo WHERE id = $1`, [vehicleId]);
    if (!existing[0] || existing[0].skupina_id !== groupId) return res.status(404).json({ error: 'not found' });

    const membership = await requireRole(res, user.id, groupId, ['admin']);
    if (!membership) return;

    if (req.method === 'DELETE') {
      await pool.query(`DELETE FROM vozilo WHERE id = $1`, [vehicleId]);
      return res.status(204).end();
    }

    const { ime, premerCevi } = req.body || {};
    try {
      const { rows: updated } = await pool.query(
        `UPDATE vozilo SET ime = COALESCE($1, ime), premer_cevi = COALESCE($2, premer_cevi)
         WHERE id = $3 RETURNING ${VEHICLE_FIELDS}`,
        [ime || null, premerCevi || null, vehicleId]
      );
      return res.status(200).json(updated[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

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
