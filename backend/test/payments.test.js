const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { Pool } = require('pg');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:hydrant@localhost:5432/hydrants_test';

const { createMockRes } = require('./helpers/mockRes');
const registerHandler = require('../api/auth/register');
const checkoutHandler = require('../api/checkout/index');
const webhookHandler = require('../api/webhooks/stripe');

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
  await pool.query('TRUNCATE vozilo, clanstvo, paket, session, skupina, uporabnik RESTART IDENTITY CASCADE');
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

function mockReqWithBody(bodyBuffer, headers) {
  const req = Readable.from([bodyBuffer]);
  req.method = 'POST';
  req.headers = headers;
  return req;
}

async function registerUser(email, uporabnisko_ime) {
  const res = createMockRes();
  await registerHandler({ method: 'POST', body: { email, uporabnisko_ime } }, res);
  return res.body;
}

test('POST /api/checkout 503s when Stripe is not configured', async () => {
  const { token } = await registerUser('nopay@example.com', 'nopay');
  const res = createMockRes();
  await checkoutHandler(
    { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { tip: 'osnovni', st_sedezev: 1 } },
    res
  );
  assert.equal(res.statusCode, 503);
});

test('POST /api/checkout validates tip and st_sedezev once configured', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  const { token } = await registerUser('badinput@example.com', 'badinput');
  const res = createMockRes();
  await checkoutHandler(
    { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { tip: 'ne-obstaja', st_sedezev: 1 } },
    res
  );
  assert.equal(res.statusCode, 400);
});

test('POST /api/webhooks/stripe records a paket on checkout.session.completed', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  const { user } = await registerUser('stripebuyer@example.com', 'stripebuyer');
  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: { object: { metadata: { kupec_id: user.id, tip: 'osnovni', st_sedezev: '3' } } }
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });

  const res = createMockRes();
  await webhookHandler(mockReqWithBody(Buffer.from(payload), { 'stripe-signature': signature }), res);
  assert.equal(res.statusCode, 200);

  const { rows } = await pool.query(`SELECT * FROM paket WHERE kupec_id = $1`, [user.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].st_sedezev, 3);
  assert.equal(rows[0].skupina_id, null);
});

test('POST /api/webhooks/stripe rejects an invalid signature', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';

  const res = createMockRes();
  await webhookHandler(mockReqWithBody(Buffer.from('{}'), { 'stripe-signature': 'bad-signature' }), res);
  assert.equal(res.statusCode, 400);
});
