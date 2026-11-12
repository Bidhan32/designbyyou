const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { connectionConfig, findPgDump } = require("../database/schema-tools.cjs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
  const config = connectionConfig();
  const output = path.resolve(__dirname, "../database/schema.baseline.sql");
  if (fs.existsSync(output)) throw new Error("schema.baseline.sql already exists. Preserve and review it before making another baseline export.");
  const temporary = `${output}.${crypto.randomUUID()}.tmp`;
  try {
    await promisify(execFile)(findPgDump(), [
      "--schema-only", "--no-owner", "--no-privileges", "--no-password",
      "--schema=public", "--lock-wait-timeout=5s", `--file=${temporary}`,
    ], {
      env: { ...process.env, PGHOST: config.host, PGPORT: String(config.port),
        PGDATABASE: config.database, PGUSER: config.user, PGPASSWORD: config.password || "", PGCONNECT_TIMEOUT: "5" },
      timeout: 60000, windowsHide: true,
    });
    if (!fs.statSync(temporary).size) throw new Error("pg_dump returned an empty schema export.");
    fs.copyFileSync(temporary, output, fs.constants.COPYFILE_EXCL);
    console.log(`Schema-only baseline saved: ${output}`);
    console.log("Review this export and test restoring it into a disposable database before using it as the baseline. No table rows were exported.");
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

main().catch((error) => {
  console.error(error.code || error.killed
    ? `Schema export failed (${error.code || "TIMEOUT"}). Check database access and pg_dump availability; set PG_DUMP_PATH if needed.`
    : error.message);
  process.exitCode = 1;
});
