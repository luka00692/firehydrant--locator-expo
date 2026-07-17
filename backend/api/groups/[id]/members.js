const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { respondIfDbError } = require('../../../lib/dbError');
const { requireAuth } = require('../../../lib/auth');
const { getMembership, requireRole, hasAvailableSeat } = require('../../../lib/authz');
const { sendPushNotification } = require('../../../lib/push');

const VALID_ROLES = ['admin', 'member'];
const VALID_STATUSES = ['approved', 'rejected'];
const MEMBERSHIP_FIELDS = `id, uporabnik_id AS "uporabnikId", skupina_id AS "skupinaId", vloga, status,
  created_at AS "createdAt"`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const groupId = req.query.id;
  const { membershipId } = req.query;

  // PATCH/DELETE target a specific membership (?membershipId=...) — folded in
  // here (rather than a separate /api/memberships/:id route) to keep the
  // Hobby plan's 12-function deploy cap, see backend/README.md TODO.
  if (membershipId && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const { rows: existing } = await pool.query(`SELECT * FROM clanstvo WHERE id = $1`, [membershipId]);
    const membership = existing[0];
    if (!membership || membership.skupina_id !== groupId) return res.status(404).json({ error: 'not found' });

    const requester = await requireRole(res, user.id, groupId, ['admin']);
    if (!requester) return;

    const { rows: targetRows } = await pool.query(`SELECT push_token, uporabnisko_ime FROM uporabnik WHERE id = $1`, [
      membership.uporabnik_id
    ]);
    const target = targetRows[0];

    if (req.method === 'DELETE') {
      await pool.query(`DELETE FROM clanstvo WHERE id = $1`, [membershipId]);
      const message =
        membership.status === 'pending' ? 'Vaša prošnja za pridružitev je bila zavrnjena.' : 'Bili ste odstranjeni iz skupine.';
      await sendPushNotification(target?.push_token, 'Sprememba članstva', message, {});
      return res.status(204).end();
    }

    const { status, vloga } = req.body || {};
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (vloga !== undefined && !VALID_ROLES.includes(vloga)) {
      return res.status(400).json({ error: `vloga must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (status === 'approved' && membership.status === 'pending') {
      const seatAvailable = await hasAvailableSeat(groupId);
      if (!seatAvailable) return res.status(409).json({ error: 'no seats available' });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE clanstvo SET status = COALESCE($1, status), vloga = COALESCE($2, vloga)
         WHERE id = $3 RETURNING ${MEMBERSHIP_FIELDS}`,
        [status || null, vloga || null, membershipId]
      );
      if (status === 'approved') {
        await sendPushNotification(target?.push_token, 'Sprejeti v skupino', 'Vaša prošnja za pridružitev je bila sprejeta.', {});
      } else if (status === 'rejected') {
        await sendPushNotification(target?.push_token, 'Prošnja zavrnjena', 'Vaša prošnja za pridružitev je bila zavrnjena.', {});
      }
      return res.status(200).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  // GET ?status=pending — folded-in list of pending join requests, admin only.
  if (req.query.status === 'pending') {
    const membership = await requireRole(res, user.id, groupId, ['admin']);
    if (!membership) return;

    const { rows } = await pool.query(
      `SELECT c.id, c.uporabnik_id AS "uporabnikId", c.vloga, c.status, c.created_at AS "createdAt",
              u.uporabnisko_ime AS "uporabniskoIme", u.email
       FROM clanstvo c
       JOIN uporabnik u ON u.id = c.uporabnik_id
       WHERE c.skupina_id = $1 AND c.status = 'pending'
       ORDER BY c.created_at ASC`,
      [groupId]
    );
    return res.status(200).json(rows);
  }

  // GET — any approved member can see the roster.
  const membership = await getMembership(user.id, groupId);
  if (!membership) return res.status(403).json({ error: 'forbidden' });

  const { rows } = await pool.query(
    `SELECT c.id, c.uporabnik_id AS "uporabnikId", c.vloga, c.status, c.created_at AS "createdAt",
            u.uporabnisko_ime AS "uporabniskoIme", u.email
     FROM clanstvo c
     JOIN uporabnik u ON u.id = c.uporabnik_id
     WHERE c.skupina_id = $1 AND c.status = 'approved'
     ORDER BY c.created_at ASC`,
    [groupId]
  );
  res.status(200).json(rows);
};
