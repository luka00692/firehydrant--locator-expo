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
const { seedTestData } = require('../scripts/seedTestData');
const uporabnikiHandler = require('../api/uporabniki/index');
const uporabnikByIdHandler = require('../api/uporabniki/[id]');
const skupineHandler = require('../api/skupine/index');
const skupinaByIdHandler = require('../api/skupine/[id]');
const paketiHandler = require('../api/paketi/index');
const clanstvaHandler = require('../api/clanstva/index');
const vozilaHandler = require('../api/vozila/index');

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
  await pool.query(
    'TRUNCATE vozilo, clanstvo, paket, skupina, uporabnik RESTART IDENTITY CASCADE'
  );
});

test('POST /api/uporabniki creates a user, GET lists it', async () => {
  const createRes = createMockRes();
  await uporabnikiHandler(
    {
      method: 'POST',
      body: { email: 'test@example.com', uporabnisko_ime: 'test', nacin_prijave: 'email' }
    },
    createRes
  );
  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.email, 'test@example.com');

  const listRes = createMockRes();
  await uporabnikiHandler({ method: 'GET', query: {} }, listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.length, 1);
});

test('POST /api/uporabniki rejects an invalid nacin_prijave', async () => {
  const res = createMockRes();
  await uporabnikiHandler(
    { method: 'POST', body: { email: 'bad@example.com', uporabnisko_ime: 'bad', nacin_prijave: 'carrier_pigeon' } },
    res
  );
  assert.equal(res.statusCode, 400);
});

test('POST /api/uporabniki requires all fields', async () => {
  const res = createMockRes();
  await uporabnikiHandler({ method: 'POST', body: { email: 'incomplete@example.com' } }, res);
  assert.equal(res.statusCode, 400);
});

test('GET /api/uporabniki/:id 404s for a missing id', async () => {
  const res = createMockRes();
  await uporabnikByIdHandler({ method: 'GET', query: { id: '00000000-0000-0000-0000-000000000000' } }, res);
  assert.equal(res.statusCode, 404);
});

test('seedTestData populates uporabnik/skupina/paket/clanstvo/vozilo consistently', async () => {
  const seeded = await seedTestData(pool);
  assert.equal(seeded.users.length, 3);
  assert.equal(seeded.groups.length, 2);

  const usersRes = createMockRes();
  await uporabnikiHandler({ method: 'GET', query: {} }, usersRes);
  assert.equal(usersRes.body.length, 3);

  const groupsRes = createMockRes();
  await skupineHandler({ method: 'GET', query: {} }, groupsRes);
  assert.equal(groupsRes.body.length, 2);
  const ljubljana = groupsRes.body.find((g) => g.ime === 'PGD Ljubljana Center');
  assert.ok(ljubljana);
  assert.ok(Math.abs(Number(ljubljana.lat) - 46.0569) < 0.001);

  const groupRes = createMockRes();
  await skupinaByIdHandler({ method: 'GET', query: { id: ljubljana.id } }, groupRes);
  assert.equal(groupRes.statusCode, 200);
  assert.equal(groupRes.body.id, ljubljana.id);

  const packagesRes = createMockRes();
  await paketiHandler({ method: 'GET', query: { skupina_id: ljubljana.id } }, packagesRes);
  assert.equal(packagesRes.body.length, 1);
  assert.equal(packagesRes.body[0].tip, 'premium');

  const membershipsRes = createMockRes();
  await clanstvaHandler({ method: 'GET', query: { skupina_id: ljubljana.id } }, membershipsRes);
  assert.equal(membershipsRes.body.length, 2);

  const vehiclesRes = createMockRes();
  await vozilaHandler({ method: 'GET', query: { skupina_id: ljubljana.id } }, vehiclesRes);
  assert.equal(vehiclesRes.body.length, 2);
});

test('POST /api/skupine requires lat/lon', async () => {
  const seeded = await seedTestData(pool);
  const res = createMockRes();
  await skupineHandler(
    { method: 'POST', body: { lastnik_id: seeded.users[0].id, ime: 'Brez lokacije' } },
    res
  );
  assert.equal(res.statusCode, 400);
});

test('POST /api/vozila rejects a non-existent skupina_id', async () => {
  const res = createMockRes();
  await vozilaHandler(
    {
      method: 'POST',
      body: { skupina_id: '00000000-0000-0000-0000-000000000000', ime: 'Test', premer_cevi: 75 }
    },
    res
  );
  assert.equal(res.statusCode, 400);
});
