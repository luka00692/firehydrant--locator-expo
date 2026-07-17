// Flat price per tier (matches web/components/screens/PackagesScreen.tsx),
// each for a fixed headcount rather than a per-seat price or a range.
const TIERS = {
  osnovni: { priceCents: 499, minSeats: 50, maxSeats: 50 },
  napredni: { priceCents: 1499, minSeats: 100, maxSeats: 100 },
  premium: { priceCents: 2499, minSeats: 200, maxSeats: 200 }
};

function validateTier(tip, stSedezev) {
  const tier = TIERS[tip];
  if (!tier || !Number.isInteger(stSedezev) || stSedezev < tier.minSeats || stSedezev > tier.maxSeats) {
    return null;
  }
  return tier;
}

function tierRangeError() {
  return `tip must be one of ${Object.keys(TIERS).join('|')}, with st_sedezev matching that tier's headcount (${Object.entries(
    TIERS
  )
    .map(([t, { minSeats, maxSeats }]) => `${t}: ${minSeats === maxSeats ? minSeats : `${minSeats}-${maxSeats}`}`)
    .join(', ')})`;
}

module.exports = { TIERS, validateTier, tierRangeError };
