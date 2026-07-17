const { getPool } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');
const { fetchSloveniaHydrants } = require('../../lib/overpass');
const { importHydrants } = require('../../scripts/importHydrants');

// Hydrants within a map viewport, so clients don't fetch the whole country at
// once — plus (via ?resync=1) the OSM resync job, triggered by Vercel Cron
// (see vercel.json). Folded together (rather than a separate
// /api/cron/resync route) to stay under the Hobby plan's 12-function
// deploy cap, see backend/README.md TODO. Vercel Cron only sends GET
// requests, hence the query param instead of a method check.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.query.resync !== undefined) {
    if (process.env.CRON_SECRET) {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }
    try {
      const features = await fetchSloveniaHydrants();
      const count = await importHydrants(getPool(), features);
      return res.status(200).json({ imported: count });
    } catch (err) {
      return res.status(502).json({ error: 'overpass sync failed', detail: err.message });
    }
  }

  // Full dataset in one request (?all=1) so the client can show every hydrant
  // at once via clustering. Slovenia's hydrant set is bounded in size, so this
  // is safe to return without a viewport filter.
  if (req.query.all !== undefined) {
    const { rows } = await getPool().query(
      `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
       FROM hydrants`
    );
    return res.status(200).json(rows);
  }

  const { minLat, minLon, maxLat, maxLon } = req.query;
  if ([minLat, minLon, maxLat, maxLon].some((v) => v === undefined)) {
    return res.status(400).json({ error: 'minLat, minLon, maxLat, maxLon are required' });
  }

  // Cap the result set so a very wide viewport can never dump the whole
  // country's hydrants onto the client (which locks up the map). The client
  // also gates rendering by zoom; this is defense in depth. ORDER BY id keeps
  // the truncated subset stable across pans instead of flickering.
  const { rows } = await getPool().query(
    `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
     FROM hydrants
     WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
     ORDER BY id
     LIMIT 2000`,
    [Number(minLon), Number(minLat), Number(maxLon), Number(maxLat)]
  );
  res.status(200).json(rows);
};
