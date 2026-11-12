const assert = require("node:assert/strict");

async function cleanupRecordedPortalConfiguration(stripe, entry, report) {
  assert.match(entry.resource, /^bpc_[A-Za-z0-9]+$/);
  const config = await stripe.billingPortal.configurations.retrieve(entry.resource);
  assert.equal(config.id, entry.resource);
  assert.equal(config.livemode, false, "Cleanup refuses a live-mode configuration");
  // Older runs predate run metadata: require the exact test headline and a
  // creation timestamp inside the recorded run rather than adopting other data.
  const start = Date.parse(report.started_at) / 1000, end = Date.parse(report.finished_at) / 1000;
  const tagged = config.metadata?.dby_test_run === report.run;
  const legacyOwned = config.business_profile?.headline === "DBY isolated test billing" &&
    Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(config.created) &&
    config.created >= Math.floor(start) && config.created <= Math.ceil(end);
  assert.ok(tagged || legacyOwned, "Configuration ownership could not be verified; no change made");
  if (!config.active) return { result: "completed", reason: "Configuration was already inactive" };
  if (config.is_default) return { result: "retained_default_configuration",
    reason: "Test configuration is the account default. It remains active; no account default or configuration settings were changed." };
  const updated = await stripe.billingPortal.configurations.update(config.id, { active: false });
  assert.equal(updated.active, false);
  return { result: "completed", reason: "Run-owned non-default test configuration deactivated" };
}
module.exports = { cleanupRecordedPortalConfiguration };
