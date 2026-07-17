// Flat price per tier (matches web/components/screens/PackagesScreen.tsx),
// each covering a fixed seat-count range rather than a per-seat price.
const TIERS = {
  osnovni: { priceCents: 499, minSeats: 1, maxSeats: 50 },
  napredni: { priceCents: 1499, minSeats: 50, maxSeats: 100 },
  premium: { priceCents: 2499, minSeats: 100, maxSeats: 200 }
};

function validateTier(tip, stSedezev) {
  const tier = TIERS[tip];
  if (!tier || !Number.isInteger(stSedezev) || stSedezev < tier.minSeats || stSedezev > tier.maxSeats) {
    return null;
  }
  return tier;
}

function tierRangeError() {
  return `tip must be one of ${Object.keys(TIERS).join('|')}, with st_sedezev in that tier's range (${Object.entries(TIERS)
    .map(([t, { minSeats, maxSeats }]) => `${t}: ${minSeats}-${maxSeats}`)
    .join(', ')})`;
}

module.exports = { TIERS, validateTier, tierRangeError };
