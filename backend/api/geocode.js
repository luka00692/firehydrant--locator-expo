const { applyCors } = require('../lib/cors');
const { geocodeAddress } = require('../lib/geocode');

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const result = await geocodeAddress(q);
    if (!result) return res.status(404).json({ error: 'not found' });
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: 'geocoding failed', detail: err.message });
  }
};
