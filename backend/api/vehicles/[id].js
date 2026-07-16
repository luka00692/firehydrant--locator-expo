const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { requireAuth } = require('../../lib/auth');
const { requireRole } = require('../../lib/authz');

const VEHICLE_FIELDS = `id, skupina_id AS "skupinaId", ime, premer_cevi AS "premerCevi", created_at AS "createdAt"`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const { rows } = await pool.query(`SELECT skupina_id FROM vozilo WHERE id = $1`, [req.query.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });

  const membership = await requireRole(res, user.id, rows[0].skupina_id, ['admin']);
  if (!membership) return;

  if (req.method === 'DELETE') {
    await pool.query(`DELETE FROM vozilo WHERE id = $1`, [req.query.id]);
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { ime, premerCevi } = req.body || {};
    try {
      const { rows: updated } = await pool.query(
        `UPDATE vozilo SET ime = COALESCE($1, ime), premer_cevi = COALESCE($2, premer_cevi)
         WHERE id = $3 RETURNING ${VEHICLE_FIELDS}`,
        [ime || null, premerCevi || null, req.query.id]
      );
      return res.status(200).json(updated[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  res.status(405).json({ error: 'method not allowed' });
};
