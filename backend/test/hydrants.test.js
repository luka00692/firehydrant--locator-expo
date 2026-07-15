const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { buildApp } = require('../src/app');

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:hydrant@localhost:5432/hydrants_test';

let pool;
let app;

before(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);

  app = buildApp({ connectionString: DATABASE_URL, logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE hydrants');
  await pool.query(`
    INSERT INTO hydrants (id, geom, properties) VALUES
      (1, ST_SetSRID(ST_MakePoint(14.5, 46.05), 4326)::geography, '{"ref":"A"}'),
      (2, ST_SetSRID(ST_MakePoint(14.51, 46.06), 4326)::geography, '{"ref":"B"}'),
      (3, ST_SetSRID(ST_MakePoint(16.0, 45.0), 4326)::geography, '{"ref":"C"}')
  `);
});

test('GET /health returns ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('GET /hydrants filters by bbox', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/hydrants?minLat=46&minLon=14&maxLat=46.1&maxLon=14.6'
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().map((h) => Number(h.id)).sort();
  assert.deepEqual(ids, [1, 2]);
});

test('GET /hydrants/nearby orders by distance and respects limit', async () => {
  const res = await app.inject({ method: 'GET', url: '/hydrants/nearby?lat=46.05&lon=14.5&limit=1' });
  assert.equal(res.statusCode, 200);
  const rows = res.json();
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].id), 1);
});

test('GET /hydrants/nearby requires lat/lon', async () => {
  const res = await app.inject({ method: 'GET', url: '/hydrants/nearby' });
  assert.equal(res.statusCode, 400);
});

test('GET /hydrants/:id returns the hydrant', async () => {
  const res = await app.inject({ method: 'GET', url: '/hydrants/1' });
  assert.equal(res.statusCode, 200);
  assert.equal(Number(res.json().id), 1);
});

test('GET /hydrants/:id 404s for a missing id', async () => {
  const res = await app.inject({ method: 'GET', url: '/hydrants/999' });
  assert.equal(res.statusCode, 404);
});

test('GET /hydrants/:id 400s for a non-numeric id', async () => {
  const res = await app.inject({ method: 'GET', url: '/hydrants/abc' });
  assert.equal(res.statusCode, 400);
});
