const { getPool } = require('../../../lib/db');
const { applyCors } = require('../../../lib/cors');
const { respondIfDbError } = require('../../../lib/dbError');
const { requireAuth } = require('../../../lib/auth');
const { requireRole } = require('../../../lib/authz');
const { sendPushNotification } = require('../../../lib/push');

const SELECT_FIELDS = `id, lastnik_id AS "lastnikId", ime, st_sedezev AS "stSedezev", created_at AS "createdAt",
  ST_Y(lokacija_doma::geometry) AS lat, ST_X(lokacija_doma::geometry) AS lng`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const pool = getPool();
  const groupId = req.query.id;

  if (req.method === 'GET') {
    const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM skupina WHERE id = $1`, [groupId]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    return res.status(200).json(rows[0]);
  }

  // Rename, home-location, and delete are admin-only.
  const membership = await requireRole(res, user.id, groupId, ['admin']);
  if (!membership) return;

  if (req.method === 'PATCH') {
    const { ime, lokacijaDoma } = req.body || {};
    const lat = lokacijaDoma?.lat;
    const lng = lokacijaDoma?.lng;
    try {
      const { rows } = await pool.query(
        `UPDATE skupina SET
           ime = COALESCE($1, ime),
           lokacija_doma = CASE WHEN $2::double precision IS NULL THEN lokacija_doma
             ELSE ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography END
         WHERE id = $4
         RETURNING ${SELECT_FIELDS}`,
        [ime || null, lng ?? null, lat ?? null, groupId]
      );
      return res.status(200).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  if (req.method === 'DELETE') {
    const { rows: members } = await pool.query(
      `SELECT u.push_token FROM uporabnik u
       JOIN clanstvo c ON c.uporabnik_id = u.id
       WHERE c.skupina_id = $1 AND c.status = 'approved' AND u.id != $2`,
      [groupId, user.id]
    );
    await pool.query(`DELETE FROM skupina WHERE id = $1`, [groupId]);
    await Promise.all(
      members.map((m) => sendPushNotification(m.push_token, 'Skupina razpuščena', 'Vaša skupina je bila izbrisana.', {}))
    );
    return res.status(204).end();
  }

  res.status(405).json({ error: 'method not allowed' });
};
