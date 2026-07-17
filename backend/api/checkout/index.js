const { applyCors } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');
const { validateTier, tierRangeError } = require('../../lib/packageTiers');

// Requires STRIPE_SECRET_KEY. The purchase itself is only recorded once the
// webhook confirms payment (api/webhooks/stripe.js), not here — see schema.sql's
// note on paket.skupina_id.
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'payments are not configured (missing STRIPE_SECRET_KEY)' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { tip, st_sedezev } = req.body || {};
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
