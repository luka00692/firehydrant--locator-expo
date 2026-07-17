const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { requireAuth } = require('../../lib/auth');
const { sendPushNotification } = require('../../lib/push');

const MEMBERSHIP_FIELDS = `id, uporabnik_id AS "uporabnikId", skupina_id AS "skupinaId", vloga, status,
  created_at AS "createdAt"`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();

  // Lets a guest poll their own join request's status (pending/approved/rejected)
  // by group name — e.g. from a "waiting for approval" screen.
  if (req.method === 'GET') {
    const imeSkupine = req.query.imeSkupine;
    if (!imeSkupine) return res.status(400).json({ error: 'imeSkupine is required' });

    const { rows } = await pool.query(
      `SELECT c.id, c.uporabnik_id AS "uporabnikId", c.skupina_id AS "skupinaId", c.vloga, c.status,
              c.created_at AS "createdAt"
       FROM clanstvo c
       JOIN skupina s ON s.id = c.skupina_id
       WHERE c.uporabnik_id = $1 AND s.ime = $2`,
      [user.id, imeSkupine]
    );
    if (!rows[0]) return res.status(404).json({ error: 'no membership request found for that group' });
    return res.status(200).json(rows[0]);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  // A guest requests to join a group by name. TEMPORARY: auto-approved on
  // creation (rather than landing in 'pending' for admin review via
  // PATCH/DELETE /api/memberships/:id) since that approval endpoint is
  // currently excluded from the deploy (see backend/README.md TODO). Revert
  // to 'pending' once route consolidation restores /api/memberships/:id.
  const { imeSkupine } = req.body || {};
  if (!imeSkupine) return res.status(400).json({ error: 'imeSkupine is required' });

  // The app only shows a user their first group (see web/lib/app-state.tsx),
  // so a user belonging to more than one would silently lose access to the
  // rest — block joining/requesting a second group while already in one.
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM clanstvo WHERE uporabnik_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
    [user.id]
  );
  if (existing[0]) {
    return res.status(400).json({ error: 'already a member of (or already requested) a group' });
  }

  const { rows: groups } = await pool.query(`SELECT * FROM skupina WHERE ime = $1`, [imeSkupine]);
  const group = groups[0];
  if (!group) return res.status(404).json({ error: 'group not found' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO clanstvo (uporabnik_id, skupina_id, vloga, status)
       VALUES ($1, $2, 'member', 'approved') RETURNING ${MEMBERSHIP_FIELDS}`,
      [user.id, group.id]
    );

    const { rows: owners } = await pool.query(
      `SELECT u.push_token FROM uporabnik u
       JOIN clanstvo c ON c.uporabnik_id = u.id
       WHERE c.skupina_id = $1 AND c.vloga = 'admin' AND c.status = 'approved'`,
      [group.id]
    );
    await Promise.all(
      owners.map((owner) =>
        sendPushNotification(
          owner.push_token,
          'Nov član skupine',
          `${user.uporabnisko_ime} se je pridružil skupini ${group.ime}.`,
          { skupinaId: group.id }
        )
      )
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (respondIfDbError(res, err)) return;
    throw err;
  }
};
