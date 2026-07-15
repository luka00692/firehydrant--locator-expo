require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'slovenia.json');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  let count = 0;
  for (const feature of data.features) {
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

  console.log(`Imported ${count} hydrants from ${DATA_PATH}`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
