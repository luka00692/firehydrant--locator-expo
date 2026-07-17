const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:hydrant@localhost:5432/hydrants_test';

const { createMockRes } = require('./helpers/mockRes');
const bboxHandler = require('../api/hydrants/index');
const nearbyHandler = require('../api/hydrants/nearby');
const byIdHandler = require('../api/hydrants/[id]');
const reportHandler = require('../api/hydrants/[id]/report');

let pool;

before(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE hydrants CASCADE');
  await pool.query(`
    INSERT INTO hydrants (id, geom, properties) VALUES
      (1, ST_SetSRID(ST_MakePoint(14.5, 46.05), 4326)::geography, '{"ref":"A"}'),
      (2, ST_SetSRID(ST_MakePoint(14.51, 46.06), 4326)::geography, '{"ref":"B"}'),
      (3, ST_SetSRID(ST_MakePoint(16.0, 45.0), 4326)::geography, '{"ref":"C"}')
  `);
});

test('GET /api/hydrants filters by bbox', async () => {
  const res = createMockRes();
  await bboxHandler(
    { method: 'GET', query: { minLat: '46', minLon: '14', maxLat: '46.1', maxLon: '14.6' } },
    res
  );
  assert.equal(res.statusCode, 200);
  const ids = res.body.map((h) => Number(h.id)).sort();
  assert.deepEqual(ids, [1, 2]);
});

test('GET /api/hydrants?resync=1 rejects a bad CRON_SECRET', async () => {
  process.env.CRON_SECRET = 'test-secret';
  try {
    const res = createMockRes();
    await bboxHandler({ method: 'GET', query: { resync: '1' }, headers: { authorization: 'Bearer wrong' } }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test('GET /api/hydrants requires bbox params', async () => {
  const res = createMockRes();
  await bboxHandler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('GET /api/hydrants/nearby orders by distance and respects limit', async () => {
  const res = createMockRes();
  await nearbyHandler({ method: 'GET', query: { lat: '46.05', lon: '14.5', limit: '1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(Number(res.body[0].id), 1);
});

test('GET /api/hydrants/nearby requires lat/lon', async () => {
  const res = createMockRes();
  await nearbyHandler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('GET /api/hydrants/:id returns the hydrant', async () => {
  const res = createMockRes();
  await byIdHandler({ method: 'GET', query: { id: '1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(Number(res.body.id), 1);
});

test('GET /api/hydrants/:id 404s for a missing id', async () => {
  const res = createMockRes();
  await byIdHandler({ method: 'GET', query: { id: '999' } }, res);
  assert.equal(res.statusCode, 404);
});

test('GET /api/hydrants/:id 400s for a non-numeric id', async () => {
  const res = createMockRes();
  await byIdHandler({ method: 'GET', query: { id: 'abc' } }, res);
  assert.equal(res.statusCode, 400);
});

test('POST /api/hydrants/:id/report stores a report', async () => {
  const res = createMockRes();
  await reportHandler(
    { method: 'POST', query: { id: '1' }, body: { sporocilo: 'Manjka premer cevi.' } },
    res
  );
  assert.equal(res.statusCode, 201);
  assert.equal(Number(res.body.hydrant_id), 1);
  assert.equal(res.body.sporocilo, 'Manjka premer cevi.');
});

test('POST /api/hydrants/:id/report requires a message', async () => {
  const res = createMockRes();
  await reportHandler({ method: 'POST', query: { id: '1' }, body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('POST /api/hydrants/:id/report rejects a non-existent hydrant', async () => {
  const res = createMockRes();
  await reportHandler(
    { method: 'POST', query: { id: '999999' }, body: { sporocilo: 'Test' } },
    res
  );
  assert.equal(res.statusCode, 400);
});

test('GET /api/hydrants/:id/report is not allowed', async () => {
  const res = createMockRes();
  await reportHandler({ method: 'GET', query: { id: '1' } }, res);
  assert.equal(res.statusCode, 405);
});
