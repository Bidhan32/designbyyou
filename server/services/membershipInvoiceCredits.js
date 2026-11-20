function stripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (/^(sk|rk)_live_/.test(key)) return true;
  if (/^(sk|rk)_test_/.test(key)) return false;
  return null;
}

function membershipPriceId(plan, liveMode = stripeMode()) {
  if (typeof liveMode !== "boolean" || !["basic","pro"].includes(plan)) return null;
  return process.env[`CREATOR_SUBSCRIPTION_${plan.toUpperCase()}_${liveMode ? "LIVE" : "TEST"}_PRICE_ID`]?.trim() || null;
}

function getPlanFromPriceId(priceId) {
  if (typeof priceId !== "string" || !priceId.startsWith("price_")) return null;
  for (const plan of ["monthly", "quarterly", "yearly"]) {
    const prefix = "CREATOR_SUBSCRIPTION_" + plan.toUpperCase();
    const current = process.env[prefix + "_PRICE_ID"]?.trim();
    const previous = (process.env[prefix + "_LEGACY_PRICE_IDS"] || "").split(",");
    if (current === priceId || previous.some(id => id.trim() === priceId)) return plan;
  }
  return null;
}

function membershipTier(priceId, liveMode) {
  if (typeof liveMode !== "boolean" || liveMode !== stripeMode() || !priceId?.startsWith("price_")) return null;
  const basic = membershipPriceId("basic", liveMode);
  const pro = membershipPriceId("pro", liveMode);
  if (basic === pro && priceId === basic) throw new Error("Membership tiers need distinct Stripe prices.");
  if (priceId === basic) return "basic";
  if (priceId === pro) return "pro";
  return null;
}

async function grantInvoiceCredits(client, invoice, owner, lines) {
  if (typeof invoice.livemode !== "boolean" || invoice.livemode !== stripeMode() || invoice.status !== "paid" || !(invoice.amount_paid > 0) ||
      !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason)) return;
  const customerId = invoice.customer?.id || invoice.customer;
  if (customerId !== owner.customerId) throw new Error("Invoice customer differs from subscription customer.");
  const grants = [];
  for (const line of lines) {
    const price = line.pricing?.price_details?.price || line.price;
    const tier = membershipTier(price?.id || price, invoice.livemode);
    if (!tier) continue;
    const parent = line.parent?.subscription_item_details;
    if (!(parent || line.type === "subscription") || (parent?.proration ?? line.proration) !== false) continue;
    const subscription = parent?.subscription || line.subscription;
    if ((subscription?.id || subscription) !== owner.subscriptionId) throw new Error("Invoice line subscription mismatch.");
    const { start, end } = line.period || {};
    if (line.currency !== "usd" || line.quantity !== 1 || line.amount !== (tier === "basic" ? 3000 : 6000) ||
        !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) {
      throw new Error("Membership invoice line does not match plan terms.");
    }
    grants.push([owner.creatorId, tier, new Date(start * 1000), new Date(end * 1000), invoice.id]);
  }
  if (grants.length > 1) throw new Error("Multiple membership charges on one invoice.");
  if (grants.length) await client.query(
    "SELECT public.grant_paid_ai_credit_period($1, $2, 1, $3, $4, $5)", grants[0],
  );
}

module.exports = { getPlanFromPriceId, stripeMode, membershipPriceId, membershipTier, grantInvoiceCredits };
