const { getPool } = require('./db');

async function getMembership(userId, skupinaId) {
  const { rows } = await getPool().query(
    `SELECT * FROM clanstvo WHERE uporabnik_id = $1 AND skupina_id = $2 AND status = 'aktiven'`,
    [userId, skupinaId]
  );
  return rows[0] || null;
}

// Call from a handler: `const m = await requireRole(res, user.id, skupinaId, ['lastnik']); if (!m) return;`
// — on failure this already wrote the 403 response.
async function requireRole(res, userId, skupinaId, roles) {
  const membership = await getMembership(userId, skupinaId);
  if (!membership || !roles.includes(membership.vloga)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return membership;
}

async function hasAvailableSeat(skupinaId) {
  const pool = getPool();
  const { rows: groupRows } = await pool.query(`SELECT st_sedezev FROM skupina WHERE id = $1`, [skupinaId]);
  if (!groupRows[0]) return false;
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS n FROM clanstvo WHERE skupina_id = $1 AND status = 'aktiven'`,
    [skupinaId]
  );
  return countRows[0].n < groupRows[0].st_sedezev;
}

module.exports = { getMembership, requireRole, hasAvailableSeat };
