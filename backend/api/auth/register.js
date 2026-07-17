const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { respondIfDbError } = require('../../lib/dbError');
const { createSession, toPublicUser } = require('../../lib/auth');

// Passwordless: identifies a user by email and starts a session, creating the
// account on first use. There is no email verification step, so this proves
// nothing about who actually controls that inbox — see backend/README.md.
// Google/Apple aren't implemented (they need OAuth app credentials).
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { email, uporabniskoIme, nacinPrijave } = req.body || {};
  if (!email || !uporabniskoIme) {
    return res.status(400).json({ error: 'email and uporabniskoIme are required' });
  }
  if (nacinPrijave && nacinPrijave !== 'email') {
    return res.status(501).json({ error: `nacinPrijave "${nacinPrijave}" is not implemented — only "email" works today` });
  }

  const pool = getPool();
  try {
    const { rows: existing } = await pool.query(`SELECT * FROM uporabnik WHERE email = $1`, [email]);
    let user = existing[0];
    if (!user) {
      const { rows } = await pool.query(
        `INSERT INTO uporabnik (email, uporabnisko_ime, nacin_prijave) VALUES ($1, $2, 'email') RETURNING *`,
        [email, uporabniskoIme]
      );
      user = rows[0];
    }

    const { token, expiresAt } = await createSession(user.id);
    res.status(200).json({ user: toPublicUser(user), token, expiresAt });
  } catch (err) {
    if (respondIfDbError(res, err)) return;
    throw err;
  }
};
