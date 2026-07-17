const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { requireAuth } = require('../../lib/auth');
const { validateTier, tierRangeError } = require('../../lib/packageTiers');

const SELECT_FIELDS = `id, lastnik_id AS "lastnikId", ime, st_sedezev AS "stSedezev", created_at AS "createdAt",
  ST_Y(lokacija_doma::geometry) AS lat, ST_X(lokacija_doma::geometry) AS lng`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();

  if (req.method === 'POST') {
    const { imeSkupine, fakePurchase } = req.body || {};

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

    if (!imeSkupine) return res.status(400).json({ error: 'imeSkupine is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // The app only shows a user their first group (see web/lib/app-state.tsx),
      // so a user belonging to more than one would silently lose access to the
      // rest — block creating a second group while already in one.
      const { rows: existingMembership } = await client.query(
        `SELECT 1 FROM clanstvo WHERE uporabnik_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
        [user.id]
      );
      if (existingMembership[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'already a member of (or already requested) a group' });
      }

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
