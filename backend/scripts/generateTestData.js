require('dotenv').config();
const { Pool } = require('pg');

// Slovenia's bounding box, matching the real dataset's coverage area.
const BBOX = { minLat: 45.42, maxLat: 46.88, minLon: 13.38, maxLon: 16.6 };

const HYDRANT_TYPES = ['pillar', 'underground', 'wall', 'pond'];
const POSITIONS = ['lane', 'green', 'sidewalk', 'parking_lot'];
const DIAMETERS = ['80', '100', '150'];

const count = Number(process.argv[2]) || 50;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeFeature(index) {
  // Negative ids can never collide with real OSM ids (always positive),
  // which also makes test rows trivial to find and delete later.
  const id = -(index + 1);
  const lat = randomBetween(BBOX.minLat, BBOX.maxLat);
  const lon = randomBetween(BBOX.minLon, BBOX.maxLon);
  const properties = {
    emergency: 'fire_hydrant',
    'fire_hydrant:type': randomFrom(HYDRANT_TYPES),
    'fire_hydrant:position': randomFrom(POSITIONS),
    'fire_hydrant:diameter': randomFrom(DIAMETERS),
    test: true
  };
  return { id, lat, lon, properties };
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let inserted = 0;
  for (let i = 0; i < count; i += 1) {
    const { id, lat, lon, properties } = makeFeature(i);
    await pool.query(
      `INSERT INTO hydrants (id, geom, properties, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, now())
       ON CONFLICT (id) DO UPDATE
         SET geom = EXCLUDED.geom, properties = EXCLUDED.properties, updated_at = now()`,
      [id, lon, lat, properties]
    );
    inserted += 1;
  }

  console.log(`Inserted ${inserted} test hydrants (ids -1..-${inserted}).`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
