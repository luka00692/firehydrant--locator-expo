const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { requireAuth } = require('../../lib/auth');
const { requireRole, hasAvailableSeat } = require('../../lib/authz');
const { sendPushNotification } = require('../../lib/push');

const VALID_ROLES = ['lastnik', 'clan', 'gost'];

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const { rows: existing } = await pool.query(`SELECT * FROM clanstvo WHERE id = $1`, [req.query.id]);
  const membership = existing[0];
  if (!membership) return res.status(404).json({ error: 'not found' });

  const requester = await requireRole(res, user.id, membership.skupina_id, ['lastnik']);
  if (!requester) return;

  const { rows: targetRows } = await pool.query(`SELECT push_token, uporabnisko_ime FROM uporabnik WHERE id = $1`, [
    membership.uporabnik_id
  ]);
  const target = targetRows[0];

  if (req.method === 'DELETE') {
    await pool.query(`DELETE FROM clanstvo WHERE id = $1`, [req.query.id]);
    const message = membership.status === 'povabljen' ? 'Vaša prošnja za pridružitev je bila zavrnjena.' : 'Bili ste odstranjeni iz skupine.';
    await sendPushNotification(target?.push_token, 'Sprememba članstva', message, {});
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { status, vloga } = req.body || {};
    if (status !== undefined && status !== 'aktiven') {
      return res.status(400).json({ error: 'status can only be set to "aktiven" via PATCH — use DELETE to remove or reject' });
    }
    if (vloga !== undefined && !VALID_ROLES.includes(vloga)) {
      return res.status(400).json({ error: `vloga must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (status === 'aktiven' && membership.status === 'povabljen') {
      const seatAvailable = await hasAvailableSeat(membership.skupina_id);
      if (!seatAvailable) return res.status(409).json({ error: 'no seats available' });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE clanstvo SET status = COALESCE($1, status), vloga = COALESCE($2, vloga) WHERE id = $3 RETURNING *`,
        [status || null, vloga || null, req.query.id]
      );
      if (status === 'aktiven') {
        await sendPushNotification(target?.push_token, 'Sprejeti v skupino', 'Vaša prošnja za pridružitev je bila sprejeta.', {});
      }
      return res.status(200).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  res.status(405).json({ error: 'method not allowed' });
};
