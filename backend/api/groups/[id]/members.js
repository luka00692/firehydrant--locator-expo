const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { requireAuth } = require('../../../lib/auth');
const { getMembership } = require('../../../lib/authz');

// Any approved member can see the roster (needed to render the group's
// member list); only admins can mutate memberships, via /api/memberships/:id.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const membership = await getMembership(user.id, req.query.id);
  if (!membership) return res.status(403).json({ error: 'forbidden' });

  const { rows } = await getPool().query(
    `SELECT c.id, c.uporabnik_id AS "uporabnikId", c.vloga, c.status, c.created_at AS "createdAt",
            u.uporabnisko_ime AS "uporabniskoIme", u.email
     FROM clanstvo c
     JOIN uporabnik u ON u.id = c.uporabnik_id
     WHERE c.skupina_id = $1 AND c.status = 'approved'
     ORDER BY c.created_at ASC`,
    [req.query.id]
  );
  res.status(200).json(rows);
};
