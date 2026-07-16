const crypto = require('crypto');
const { getPool } = require('./db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getPool().query(`INSERT INTO session (token, uporabnik_id, expires_at) VALUES ($1, $2, $3)`, [
    token,
    userId,
    expiresAt
  ]);
  return { token, expiresAt };
}

async function getUserFromRequest(req) {
  const header = req.headers?.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);

  const { rows } = await getPool().query(
    `SELECT u.* FROM session s
     JOIN uporabnik u ON u.id = s.uporabnik_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  return rows[0] || null;
}

// Call from a handler: `const user = await requireAuth(req, res); if (!user) return;`
// — on failure this already wrote the 401 response, the caller just needs to stop.
async function requireAuth(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return user;
}

module.exports = { createSession, getUserFromRequest, requireAuth };
