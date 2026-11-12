const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { connectionConfig, inspectSchema } = require("../database/schema-tools.cjs");
const { loadMigrations, migrationStatus, applyMigrations } = require("../database/migration-engine.cjs");

const databaseDirectory = path.resolve(__dirname, "../database");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
  const command = process.argv[2];
  if (!["inspect", "status", "migrate"].includes(command)) {
    throw new Error("Use npm run db:inspect, db:status, or db:migrate.");
  }
  const migrations = loadMigrations(path.join(databaseDirectory, "migrations"));
  if (command === "migrate") {
    const baseline = path.join(databaseDirectory, "schema.baseline.sql");
    if (!fs.existsSync(baseline) || !fs.statSync(baseline).size) {
      throw new Error("Capture and review the actual database baseline before applying migrations. See database/README.md.");
    }
    if (!migrations.length) {
      console.log("No forward migrations are staged. No database changes were requested.");
      return;
    }
  }
  const pool = new Pool(connectionConfig());
  let client;
  try {
    client = await pool.connect();
    if (command === "inspect") {
      const snapshot = await inspectSchema(client);
      const output = path.join(databaseDirectory, "schema.snapshot.json");
      fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`Schema metadata saved: ${output}`);
      console.log(`Inspected ${new Set(snapshot.columns.map((column) => column.table_name)).size} public relations; ${snapshot.missing.length} missing critical-path tables/columns.`);
      for (const missing of snapshot.missing) console.log(`  ${missing.problem}: ${missing.table}${missing.column ? `.${missing.column}` : ""}`);
      if (snapshot.missing.length) process.exitCode = 2;
    } else if (command === "status") {
      console.log(JSON.stringify(await migrationStatus(client, migrations), null, 2));
    } else {
      const applied = await applyMigrations(client, migrations);
      console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Migration history is up to date.");
    }
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((error) => {
  // Database error messages may include connection details or SQL values.
  console.error(error.code ? `Database command failed (${error.code}). Check connectivity, permissions, and server/.env.` : error.message);
  process.exitCode = 1;
});
