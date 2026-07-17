const { applyCors } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');
const { getPool } = require('../../lib/db');
const { respondIfDbError } = require('../../lib/dbError');
const { validateTier, tierRangeError } = require('../../lib/packageTiers');

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Handles both the (authenticated) checkout-session creation POST and the
// Stripe webhook POST on this same route — told apart by the presence of a
// stripe-signature header — folded together (rather than a separate
// /api/webhooks/stripe route) to stay under the Hobby plan's 12-function
// deploy cap, see backend/README.md TODO. Point Stripe's webhook URL at
// /api/checkout once payments are configured. Needs the raw body for Stripe's
// signature verification, so bodyParser is off for the whole file — the
// checkout-creation path below parses its own JSON body manually.
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res);
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    applyCors(res);
    return res.status(405).json({ error: 'method not allowed' });
  }

  const signature = req.headers['stripe-signature'];
  const rawBody = await readRawBody(req);

  if (signature) {
    // --- Stripe webhook: records a paket only once Stripe confirms payment ---
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ error: 'payments are not configured' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
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

    return res.status(200).json({ received: true });
  }

  // --- Authenticated checkout-session creation ---
  applyCors(res);

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'payments are not configured (missing STRIPE_SECRET_KEY)' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    return res.status(400).json({ error: 'invalid JSON body' });
  }

  const { tip, st_sedezev } = body;
  const tier = validateTier(tip, st_sedezev);
  if (!tier) {
    return res.status(400).json({ error: tierRangeError() });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: `Paket ${tip} (${st_sedezev} mest)` },
          unit_amount: tier.priceCents
        },
        quantity: 1
      }
    ],
    metadata: { kupec_id: user.id, tip, st_sedezev: String(st_sedezev) },
    success_url: process.env.CHECKOUT_SUCCESS_URL || 'https://example.com/checkout/success',
    cancel_url: process.env.CHECKOUT_CANCEL_URL || 'https://example.com/checkout/cancel'
  });

  res.status(200).json({ url: session.url });
};

// Stripe signature verification needs the exact raw request bytes — this
// applies to the whole handler above, including the checkout-creation path.
module.exports.config = { api: { bodyParser: false } };
