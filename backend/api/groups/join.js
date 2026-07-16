const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { requireAuth } = require('../../lib/auth');
const { sendPushNotification } = require('../../lib/push');

// A guest requests to join a group by name. The membership row lands in
// 'povabljen' (pending) — the group's admin approves/rejects it via
// PATCH/DELETE /api/memberships/:id.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  const { ime } = req.body || {};
  if (!ime) return res.status(400).json({ error: 'ime (group name) is required' });

  const pool = getPool();
  const { rows: groups } = await pool.query(`SELECT * FROM skupina WHERE ime = $1`, [ime]);
  const group = groups[0];
  if (!group) return res.status(404).json({ error: 'group not found' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO clanstvo (uporabnik_id, skupina_id, vloga, status) VALUES ($1, $2, 'clan', 'povabljen') RETURNING *`,
      [user.id, group.id]
    );

    const { rows: owners } = await pool.query(
      `SELECT u.push_token FROM uporabnik u
       JOIN clanstvo c ON c.uporabnik_id = u.id
       WHERE c.skupina_id = $1 AND c.vloga = 'lastnik' AND c.status = 'aktiven'`,
      [group.id]
    );
    await Promise.all(
      owners.map((owner) =>
        sendPushNotification(
          owner.push_token,
          'Nova prošnja za pridružitev',
          `${user.uporabnisko_ime} želi pridružiti skupini ${group.ime}.`,
          { skupina_id: group.id }
        )
      )
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (respondIfDbError(res, err)) return;
    throw err;
  }
};
