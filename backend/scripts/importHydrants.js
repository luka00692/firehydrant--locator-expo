const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'slovenia.json');

async function importHydrants(pool, features) {
  let count = 0;
  for (const feature of features) {
    const [lon, lat] = feature.geometry.coordinates;
    await pool.query(
      `INSERT INTO hydrants (id, geom, properties, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, now())
       ON CONFLICT (id) DO UPDATE
         SET geom = EXCLUDED.geom, properties = EXCLUDED.properties, updated_at = now()`,
      [feature.id, lon, lat, feature.properties || {}]
    );
    count += 1;
  }
  return count;
}

async function run() {
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const count = await importHydrants(pool, data.features);

  console.log(`Imported ${count} hydrants from ${DATA_PATH}`);
  await pool.end();
}

module.exports = { importHydrants };

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
