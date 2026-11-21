const { getPlanFromPriceId, membershipTier, stripeMode } = require("./membershipInvoiceCredits");

async function bookingTerms(db, creator, hasSubscription, baseCents) {
  const standardTier = hasSubscription && membershipTier(creator.stripe_subscription_price_id, stripeMode());
  const { rows: [plan] } = await db.query(
    `SELECT p.* FROM membership_plan_versions p
      LEFT JOIN creator_enterprise_terms e ON e.user_id=$1 AND e.tier=p.tier
        AND e.plan_version=p.version AND now()>=e.starts_at AND now()<e.ends_at
      WHERE e.user_id IS NOT NULL OR p.tier=$2
      ORDER BY (e.user_id IS NOT NULL) DESC, p.version DESC LIMIT 1`,
    [creator.id, standardTier || "free"]);
  if (!plan || [plan.rewards_per_1000_usd, plan.alteration_limit, plan.purchase_discount_percent].some(v => !Number.isInteger(v))) {
    throw new Error("Booking membership terms are incomplete.");
  }
  const discount = plan.tier === "enterprise"
    ? (baseCents >= 1000000 ? 35 : 0)
    : plan.purchase_discount_percent;
  return {
    tier: plan.tier, version: plan.version,
    fee_cents: hasSubscription && getPlanFromPriceId(creator.stripe_subscription_price_id) ? 0 : plan.booking_fee_usd_cents,
    discount_percent: discount,
    discount_cents: Math.round(baseCents * discount / 100),
    rewards_per_1000_usd: plan.rewards_per_1000_usd,
    alterations: plan.alteration_limit,
  };
}

module.exports = { bookingTerms };
