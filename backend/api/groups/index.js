const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { requireAuth } = require('../../lib/auth');
const { validateTier, tierRangeError } = require('../../lib/packageTiers');
const { sendPushNotification } = require('../../lib/push');

const SELECT_FIELDS = `id, lastnik_id AS "lastnikId", ime, st_sedezev AS "stSedezev", created_at AS "createdAt",
  ST_Y(lokacija_doma::geometry) AS lat, ST_X(lokacija_doma::geometry) AS lng`;

const MEMBERSHIP_FIELDS = `id, uporabnik_id AS "uporabnikId", skupina_id AS "skupinaId", vloga, status,
  created_at AS "createdAt"`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();

  if (req.method === 'POST') {
    const { imeSkupine, fakePurchase, join } = req.body || {};

    // TEMPORARY demo bypass: /api/checkout (real Stripe) is excluded from the
    // deploy anyway (see backend/README.md TODO) and Stripe isn't configured,
    // so record a paket directly here — exactly what the webhook would do on
    // a real payment — instead of actually charging anything. Folded into
    // this already-deployed route rather than adding a new one, to stay
    // under the Hobby plan's 12-function cap.
    if (fakePurchase) {
      const { tip, stSedezev } = fakePurchase;
      const tier = validateTier(tip, stSedezev);
      if (!tier) return res.status(400).json({ error: tierRangeError() });

      try {
        const { rows } = await pool.query(
          `INSERT INTO paket (kupec_id, tip, st_sedezev) VALUES ($1, $2, $3)
           RETURNING id, kupec_id AS "kupecId", skupina_id AS "skupinaId", tip, st_sedezev AS "stSedezev", created_at AS "createdAt"`,
          [user.id, tip, stSedezev]
        );
        return res.status(201).json(rows[0]);
      } catch (err) {
        if (respondIfDbError(res, err)) return;
        throw err;
      }
    }

    // A guest requests to join a group by name — folded in here (rather than
    // a separate /api/groups/join route) to stay under the Hobby plan's
    // 12-function deploy cap, see backend/README.md TODO.
    if (join) {
      const { imeSkupine: joinIme } = join;
      if (!joinIme) return res.status(400).json({ error: 'imeSkupine is required' });

      const { rows: groups } = await pool.query(`SELECT * FROM skupina WHERE ime = $1`, [joinIme]);
      let group = groups[0];

      try {
        // TEMPORARY: auto-approved on creation (rather than landing in
        // 'pending' for admin review) since the endpoint that would otherwise
        // approve/reject it is a lower priority than getting testers into the
        // app. Also auto-creates the group (as the requester's admin) when the
        // typed name doesn't match an existing one, instead of 404ing. A user
        // can belong to any number of groups and re-request the same one —
        // neither is blocked, always lets them through.
        // Revert once real group/membership management workflows matter
        // more than frictionless demo access — see backend/README.md TODO.
        let vloga = 'member';
        if (!group) {
          const { rows: createdGroups } = await pool.query(
            `INSERT INTO skupina (lastnik_id, ime, st_sedezev) VALUES ($1, $2, 0) RETURNING *`,
            [user.id, joinIme]
          );
          group = createdGroups[0];
          vloga = 'admin';
        }

        const { rows } = await pool.query(
          `INSERT INTO clanstvo (uporabnik_id, skupina_id, vloga, status)
           VALUES ($1, $2, $3, 'approved')
           ON CONFLICT (uporabnik_id, skupina_id) DO UPDATE SET status = 'approved'
           RETURNING ${MEMBERSHIP_FIELDS}`,
          [user.id, group.id, vloga]
        );

        const { rows: owners } = await pool.query(
          `SELECT u.push_token FROM uporabnik u
           JOIN clanstvo c ON c.uporabnik_id = u.id
           WHERE c.skupina_id = $1 AND c.vloga = 'admin' AND c.status = 'approved' AND u.id != $2`,
          [group.id, user.id]
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

        return res.status(201).json(rows[0]);
      } catch (err) {
        if (respondIfDbError(res, err)) return;
        throw err;
      }
    }

    if (!imeSkupine) return res.status(400).json({ error: 'imeSkupine is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Consume the buyer's oldest unassigned package — this is what "you need
      // a purchased package before you can create a group" means in practice.
      const { rows: paketRows } = await client.query(
        `SELECT * FROM paket WHERE kupec_id = $1 AND skupina_id IS NULL ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [user.id]
      );
      if (!paketRows[0]) {
        await client.query('ROLLBACK');
        return res.status(402).json({ error: 'no purchased package available — buy one via POST /api/checkout first' });
      }
      const paket = paketRows[0];

      const { rows: groupRows } = await client.query(
        `INSERT INTO skupina (lastnik_id, ime, st_sedezev) VALUES ($1, $2, $3) RETURNING ${SELECT_FIELDS}`,
        [user.id, imeSkupine, paket.st_sedezev]
      );
      const group = groupRows[0];

      await client.query(`UPDATE paket SET skupina_id = $1 WHERE id = $2`, [group.id, paket.id]);
      await client.query(
        `INSERT INTO clanstvo (uporabnik_id, skupina_id, vloga, status) VALUES ($1, $2, 'admin', 'approved')`,
        [user.id, group.id]
      );

      await client.query('COMMIT');
      return res.status(201).json(group);
    } catch (err) {
      await client.query('ROLLBACK');
      if (respondIfDbError(res, err)) return;
      throw err;
    } finally {
      client.release();
    }
  }

  // GET ?imeSkupine=... — folded-in poll for a guest's own join request
  // status (pending/approved/rejected) by group name, e.g. from a "waiting
  // for approval" screen.
  if (req.query.imeSkupine) {
    const { rows } = await pool.query(
      `SELECT c.id, c.uporabnik_id AS "uporabnikId", c.skupina_id AS "skupinaId", c.vloga, c.status,
              c.created_at AS "createdAt"
       FROM clanstvo c
       JOIN skupina s ON s.id = c.skupina_id
       WHERE c.uporabnik_id = $1 AND s.ime = $2`,
      [user.id, req.query.imeSkupine]
    );
    if (!rows[0]) return res.status(404).json({ error: 'no membership request found for that group' });
    return res.status(200).json(rows[0]);
  }

  // GET — groups the caller has an approved membership in.
  const { rows } = await pool.query(
    `SELECT s.id, s.lastnik_id AS "lastnikId", s.ime, s.st_sedezev AS "stSedezev", s.created_at AS "createdAt",
            ST_Y(s.lokacija_doma::geometry) AS lat, ST_X(s.lokacija_doma::geometry) AS lng,
            c.vloga
     FROM skupina s
     JOIN clanstvo c ON c.skupina_id = s.id
     WHERE c.uporabnik_id = $1 AND c.status = 'approved'
     ORDER BY s.created_at DESC`,
    [user.id]
  );
  res.status(200).json(rows);
};
