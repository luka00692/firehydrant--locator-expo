const { getPool } = require('../../lib/db');
const { fetchSloveniaHydrants } = require('../../lib/overpass');
const { importHydrants } = require('../../scripts/importHydrants');

// Triggered by Vercel Cron (see vercel.json) to keep hydrant data in sync with
// OSM instead of relying solely on the one-time slovenia.json import.
module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  try {
    const features = await fetchSloveniaHydrants();
    const count = await importHydrants(getPool(), features);
    res.status(200).json({ imported: count });
  } catch (err) {
    res.status(502).json({ error: 'overpass sync failed', detail: err.message });
  }
};
