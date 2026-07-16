const { getPool } = require('../../lib/db');
const { respondIfDbError } = require('../../lib/dbError');

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Records a purchased paket only once Stripe confirms payment. Requires
// STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (the signing secret shown when
// you register this endpoint's URL in the Stripe dashboard).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'payments are not configured' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `invalid signature: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const { kupec_id, tip, st_sedezev } = event.data.object.metadata || {};
    try {
      await getPool().query(`INSERT INTO paket (kupec_id, tip, st_sedezev) VALUES ($1, $2, $3)`, [
        kupec_id,
        tip,
        Number(st_sedezev)
      ]);
    } catch (err) {
      if (respondIfDbError(res, err)) return;
      throw err;
    }
  }

  res.status(200).json({ received: true });
};

// Stripe signature verification needs the exact raw request bytes.
module.exports.config = { api: { bodyParser: false } };
