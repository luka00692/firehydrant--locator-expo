const { applyCors } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');

// Flat price per tier (matches web/components/screens/PackagesScreen.tsx),
// each covering a fixed seat-count range rather than a per-seat price.
const TIERS = {
  osnovni: { priceCents: 499, minSeats: 1, maxSeats: 50 },
  napredni: { priceCents: 1499, minSeats: 50, maxSeats: 100 },
  premium: { priceCents: 2499, minSeats: 100, maxSeats: 200 }
};

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
  const tier = TIERS[tip];
  if (!tier || !Number.isInteger(st_sedezev) || st_sedezev < tier.minSeats || st_sedezev > tier.maxSeats) {
    return res.status(400).json({
      error: `tip must be one of ${Object.keys(TIERS).join('|')}, with st_sedezev in that tier's range (${Object.entries(
        TIERS
      )
        .map(([t, { minSeats, maxSeats }]) => `${t}: ${minSeats}-${maxSeats}`)
        .join(', ')})`
    });
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
