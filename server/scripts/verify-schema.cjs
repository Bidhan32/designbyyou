const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Pool } = require("pg");
const { connectionConfig, findPgDump, inspectSchema } = require("../database/schema-tools.cjs");
const { analyzeBaseline, prepareRestoreSql, verificationDatabaseName, assertVerificationTarget, compareRestoredSchema, schemaCollectionDifferences } = require("../database/baseline-tools.cjs");

const directory = path.resolve(__dirname, "../database");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
  const baseline = fs.readFileSync(path.join(directory, "schema.baseline.sql"), "utf8");
  const expected = JSON.parse(fs.readFileSync(path.join(directory, "schema.snapshot.json"), "utf8"));
  const analysis = analyzeBaseline(baseline);
  const expectedTables = [...new Set(expected.columns.map((column) => column.table_name))].sort();
  if (JSON.stringify(analysis.tables) !== JSON.stringify(expectedTables)) {
    throw new Error("Baseline tables do not match the snapshot. Export and inspect the same database before verification.");
  }
  const restoreSql = prepareRestoreSql(baseline);
  const config = connectionConfig();
  const name = verificationDatabaseName();
  assertVerificationTarget(name, config.database);
  const temporary = path.join(os.tmpdir(), `${name}.sql`);
  const log = path.join(directory, "schema.verify.log");
  const admin = new Pool(config);
  let verificationPool;
  let created = false;
  let temporaryCreated = false;
  try {
    fs.writeFileSync(temporary, restoreSql, { flag: "wx" });
    temporaryCreated = true;
    // Database names are generated locally and checked before every DDL operation.
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    console.log(`Created disposable verification database: ${name}`);
    const dump = findPgDump();
    const psql = process.env.PSQL_PATH || (path.isAbsolute(dump)
      ? path.join(path.dirname(dump), process.platform === "win32" ? "psql.exe" : "psql") : "psql");
    try {
      await promisify(execFile)(psql, ["--no-psqlrc", "--no-password", "--single-transaction", "--set=ON_ERROR_STOP=1", `--file=${temporary}`], {
        env: { ...process.env, PGHOST: config.host, PGPORT: String(config.port), PGUSER: config.user,
          PGPASSWORD: config.password || "", PGDATABASE: name, PGCONNECT_TIMEOUT: "5" },
        timeout: 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      fs.writeFileSync(log, String(error.stderr || error.code || "Restore process failed."));
      throw new Error(`Disposable restore failed; PostgreSQL diagnostics saved to ${log}`);
    }
    verificationPool = new Pool({ ...config, database: name });
    const client = await verificationPool.connect();
    let restored;
    try { restored = await inspectSchema(client); } finally { client.release(); }
    const differences = compareRestoredSchema(expected, restored);
    if (restored.missing.length || differences.length) {
      const details = schemaCollectionDifferences(expected, restored);
      fs.writeFileSync(log, JSON.stringify({ captured_at: new Date().toISOString(), missing: restored.missing, differences, details }, null, 2));
      const restoredPath = path.join(directory, "schema.restored.snapshot.json");
      fs.writeFileSync(restoredPath, JSON.stringify(restored, null, 2));
      for (const [category, changes] of Object.entries(details)) {
        for (const change of changes.slice(0, 10)) console.log(`  ${category}: ${change.change} ${change.object}`);
        if (changes.length > 10) console.log(`  ${category}: ${changes.length - 10} additional differences recorded in the log.`);
      }
      throw new Error(`Restored schema differs from the snapshot. See ${log}`);
    }
    fs.writeFileSync(log, JSON.stringify({ verified_at: new Date().toISOString(), result: "passed", tables: analysis.tables.length }, null, 2));
    console.log(`PASS: baseline restored; ${analysis.tables.length} public tables, columns, defaults, constraints, indexes, and enum labels match the snapshot.`);
    console.log("Schema-only validation passed. Application and payment integration tests remain separate.");
  } finally {
    try { await verificationPool?.end(); } catch {
      console.error("Unable to close all disposable verification connections cleanly.");
      process.exitCode = 1;
    }
    try {
      if (created) {
        assertVerificationTarget(name, config.database);
        await admin.query(`DROP DATABASE "${name}"`);
        console.log(`Removed disposable verification database: ${name}`);
      }
    } catch (error) {
      console.error(`Cleanup failed (${error.code || "UNKNOWN"}); only the disposable database ${name} may remain.`);
      process.exitCode = 1;
    } finally {
      try { await admin.end(); } finally {
        if (temporaryCreated) fs.rmSync(temporary, { force: true });
      }
    }
  }
}

main().catch((error) => {
  console.error(error.code ? `Schema verification failed (${error.code}). Check connectivity and permission to create a disposable database.` : error.message);
  process.exitCode = 1;
});
