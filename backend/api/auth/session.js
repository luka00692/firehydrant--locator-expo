const { applyCors } = require('../../lib/cors');
const { getUserFromRequest } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  res.status(200).json({ user });
};
