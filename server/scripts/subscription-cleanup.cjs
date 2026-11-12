"use strict";
const fs = require("node:fs"), path = require("node:path"), Stripe = require("stripe");
const { assertTestKey } = require("./support/isolated-app.cjs");
const { cleanupRecordedPortalConfiguration } = require("./support/subscription-cleanup.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const filename = path.resolve(__dirname, "../subscription-sandbox-report.json");
(async () => {
  assertTestKey(process.env.STRIPE_SECRET_KEY);
  const report = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!Array.isArray(report.cleanup) || !report.run) throw new Error("A valid existing subscription report is required");
  const pending = report.cleanup.filter((entry) => entry.result === "failed");
  if (!pending.length) { console.log("No failed cleanup entries remain. Existing report preserved."); return; }
  if (pending.some((entry) => !/^bpc_[A-Za-z0-9]+$/.test(entry.resource))) throw new Error("Non-portal cleanup failures need separate review; report preserved");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  if ((await stripe.balance.retrieve()).livemode !== false) throw new Error("Cleanup requires test mode");
  for (const entry of pending) {
    const outcome = await cleanupRecordedPortalConfiguration(stripe, entry, report);
    entry.previous_error = entry.error; delete entry.error;
    Object.assign(entry, outcome, { reviewed_at: new Date().toISOString() });
    console.log(`${outcome.result.toUpperCase()}: ${entry.resource}\n${outcome.reason}`);
  }
  // Preserve test failures. Retained resources are explicitly distinguished from
  // full cleanup; never promote a partially tested or failed run to PASSED.
  if (report.result === "cleanup_failed" && report.database_cleanup === "completed" && !report.error && !report.cleanup_error &&
      report.checks?.length === 10 && report.cleanup.every((entry) => ["completed", "retained_default_configuration"].includes(entry.result))) {
    report.result = report.cleanup.some((entry) => entry.result === "retained_default_configuration") ? "passed_with_retained_test_configuration" : "passed";
  }
  report.cleanup_reviewed_at = new Date().toISOString();
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");
  console.log(`Subscription report: ${report.result.toUpperCase()}`);
})().catch((error) => {
  console.error(`Cleanup retry failed; report preserved: ${error.type || error.code || "ownership/setup validation failed"}`);
  process.exitCode = 1;
});
