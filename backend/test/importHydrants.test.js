const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { importHydrants } = require('../scripts/importHydrants');

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:hydrant@localhost:5432/hydrants_test';

let pool;

before(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE hydrants CASCADE');
});

const FEATURE = { id: 100, geometry: { coordinates: [14.5, 46.05] }, properties: { ref: 'X' } };

test('inserts new hydrants', async () => {
  const count = await importHydrants(pool, [FEATURE]);
  assert.equal(count, 1);

  const { rows } = await pool.query('SELECT * FROM hydrants');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].properties.ref, 'X');
});

test('re-running with changed properties updates instead of duplicating', async () => {
  await importHydrants(pool, [FEATURE]);
  await importHydrants(pool, [{ ...FEATURE, properties: { ref: 'Y' } }]);

  const { rows } = await pool.query('SELECT * FROM hydrants');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].properties.ref, 'Y');
});
