const { applyCors } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');

const VALID_TYPES = ['osnovni', 'napredni', 'premium'];
const CENTS_PER_SEAT = 500; // placeholder pricing — adjust once real prices are decided

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
  if (!VALID_TYPES.includes(tip) || !Number.isInteger(st_sedezev) || st_sedezev < 1) {
    return res.status(400).json({ error: 'tip (osnovni|napredni|premium) and a positive integer st_sedezev are required' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: `Paket ${tip} (${st_sedezev} mest)` },
          unit_amount: CENTS_PER_SEAT * st_sedezev
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
