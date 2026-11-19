// The first rollout uses Stripe sandbox prices exclusively.
function sandboxMembershipTier(priceId, liveMode) {
  if (liveMode !== false || !priceId?.startsWith("price_")) return null;
  const basic = process.env.CREATOR_SUBSCRIPTION_BASIC_TEST_PRICE_ID;
  const pro = process.env.CREATOR_SUBSCRIPTION_PRO_TEST_PRICE_ID;
  if (basic === pro && priceId === basic) throw new Error("Membership tiers need distinct Stripe prices.");
  if (priceId === basic) return "basic";
  if (priceId === pro) return "pro";
  return null;
}

async function grantInvoiceCredits(client, invoice, owner, lines) {
  if (invoice.livemode !== false || invoice.status !== "paid" || !(invoice.amount_paid > 0) ||
      !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason)) return;
  const customerId = invoice.customer?.id || invoice.customer;
  if (customerId !== owner.customerId) throw new Error("Invoice customer differs from subscription customer.");
  const grants = [];
  for (const line of lines) {
    const price = line.pricing?.price_details?.price || line.price;
    const tier = sandboxMembershipTier(price?.id || price, invoice.livemode);
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

module.exports = { sandboxMembershipTier, grantInvoiceCredits };
