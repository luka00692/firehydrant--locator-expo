const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { email, uporabnisko_ime, nacin_prijave } = req.body || {};
    if (!email || !uporabnisko_ime || !nacin_prijave) {
      return res.status(400).json({ error: 'email, uporabnisko_ime and nacin_prijave are required' });
    }
    try {
      const { rows } = await getPool().query(
        `INSERT INTO uporabnik (email, uporabnisko_ime, nacin_prijave) VALUES ($1, $2, $3) RETURNING *`,
        [email, uporabnisko_ime, nacin_prijave]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  const { rows } = await getPool().query(`SELECT * FROM uporabnik ORDER BY created_at DESC`);
  res.status(200).json(rows);
};
