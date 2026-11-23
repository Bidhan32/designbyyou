const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { grantInvoiceCredits, membershipTier } = require("../services/membershipInvoiceCredits");
const { bookingTerms } = require("../services/bookingMembership");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

test("live invoice fixtures grant Basic and Pro once, carry unused credits, and isolate test prices", async t => {
  require("dotenv").config({ quiet: true });
  process.env.STRIPE_SECRET_KEY = "sk_live_offline_fixture";
  process.env.CREATOR_SUBSCRIPTION_BASIC_LIVE_PRICE_ID = "price_live_basic";
  process.env.CREATOR_SUBSCRIPTION_PRO_LIVE_PRICE_ID = "price_live_pro";
  process.env.CREATOR_SUBSCRIPTION_BASIC_TEST_PRICE_ID = "price_sandbox_basic";
  const sandbox = await sandboxDatabase();
  t.after(() => sandbox.dispose());
  const db = sandbox.pool;
  const creatorId = randomUUID();
  await db.query("INSERT INTO users(id,role,full_name,email,password_hash) VALUES($1,'creator','Fixture',$2,'fixture')",[creatorId,creatorId+"@example.invalid"]);
  const owner = { creatorId, customerId: "cus_fixture", subscriptionId: "sub_fixture" };
  const invoice = { id:"in_first", customer:owner.customerId, status:"paid", amount_paid:5000, livemode:true, billing_reason:"subscription_create" };
  const line = { price:"price_live_basic", type:"subscription", proration:false, subscription:owner.subscriptionId, period:{start:1800000000,end:1802678400},currency:"usd",amount:5000,quantity:1 };
  const grant = (i,l) => grantInvoiceCredits(db,i,owner,[l]);
  assert.equal(membershipTier("price_sandbox_basic", true),null);
  await grant({...invoice,livemode:false},{...line,price:"price_sandbox_basic"});
  await grant({...invoice,status:"open"},line);
  await grant(invoice,{...line,proration:true});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM membership_ai_credit_periods")).rows[0].n,0);
  await Promise.all([grant(invoice,line), grant(invoice,line)]);
  await db.query("UPDATE membership_ai_credit_periods SET spent=100 WHERE user_id=$1",[creatorId]);
  const second = {...invoice,id:"in_renew",amount_paid:10000,billing_reason:"subscription_cycle"};
  const renewed = {...line,price:"price_live_pro",amount:10000,period:{start:line.period.end,end:line.period.end+2592000}};
  await grant(second,renewed);
  await grant(second,renewed);
  const periods=await db.query("SELECT tier,granted,carried FROM membership_ai_credit_periods ORDER BY period_start");
  assert.deepEqual(periods.rows,[{tier:"basic",granted:1500,carried:0},{tier:"pro",granted:4500,carried:140}]);

  const unknown = await bookingTerms(db, { id:creatorId, stripe_subscription_price_id:"price_unrecognized" }, true, 10000);
  assert.equal(unknown.fee_cents,500);
  assert.equal(unknown.tier,"free");
  assert.equal(unknown.rewards_per_1000_usd,0);
  const free = await bookingTerms(db, { id:creatorId }, false, 100000);
  assert.equal(free.rewards_per_1000_usd,0);
  for (const [tier,discount,rate] of [["basic",6,5],["pro",16,10]]) {
    const plan = await bookingTerms(db,{id:creatorId,stripe_subscription_price_id:"price_live_"+tier},true,100000);
    assert.equal(plan.discount_percent,discount);
    assert.equal(plan.rewards_per_1000_usd,rate);
  }

  await db.query("INSERT INTO membership_plan_versions VALUES('enterprise',2,NULL,10000,0,8,6,20)");
  await db.query("INSERT INTO creator_enterprise_terms(user_id,plan_version,starts_at,ends_at) VALUES($1,2,now()-interval '1 day',now()+interval '30 days')",[creatorId]);
  const terms=await bookingTerms(db,{id:creatorId},false,10000);
  assert.deepEqual(terms,{tier:"enterprise",version:2,fee_cents:0,discount_percent:0,discount_cents:0,rewards_per_1000_usd:8,alterations:6});
  for (const [price, discount] of [[999999,0],[1000000,350000],[1200000,420000]]) {
    assert.equal((await bookingTerms(db,{id:creatorId},false,price)).discount_cents,discount);
  }
});
