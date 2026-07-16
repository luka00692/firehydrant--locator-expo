const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { requireAuth } = require('../../../lib/auth');
const { requireRole } = require('../../../lib/authz');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const membership = await requireRole(res, user.id, req.query.id, ['lastnik']);
  if (!membership) return;

  const { rows } = await getPool().query(
    `SELECT c.id, c.uporabnik_id, c.vloga, c.status, c.created_at, u.uporabnisko_ime, u.email
     FROM clanstvo c
     JOIN uporabnik u ON u.id = c.uporabnik_id
     WHERE c.skupina_id = $1 AND c.status = 'povabljen'
     ORDER BY c.created_at ASC`,
    [req.query.id]
  );
  res.status(200).json(rows);
};
