const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');

const SELECT_FIELDS = `id, lastnik_id, ime, st_sedezev, created_at,
  ST_Y(lokacija_doma::geometry) AS lat, ST_X(lokacija_doma::geometry) AS lon`;

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { lastnik_id, ime, lat, lon, st_sedezev } = req.body || {};
    if (!lastnik_id || !ime || lat === undefined || lon === undefined) {
      return res.status(400).json({ error: 'lastnik_id, ime, lat and lon are required' });
    }
    try {
      const { rows } = await getPool().query(
        `INSERT INTO skupina (lastnik_id, ime, lokacija_doma, st_sedezev)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5)
         RETURNING ${SELECT_FIELDS}`,
        [lastnik_id, ime, Number(lon), Number(lat), st_sedezev || 0]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  const { rows } = await getPool().query(`SELECT ${SELECT_FIELDS} FROM skupina ORDER BY created_at DESC`);
  res.status(200).json(rows);
};
