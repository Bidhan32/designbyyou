const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Pool } = require("pg");
const { connectionConfig, findPgDump, inspectSchema } = require("../../database/schema-tools.cjs");
const { prepareRestoreSql, compareRestoredSchema } = require("../../database/baseline-tools.cjs");

async function sandboxDatabase() {
  const directory = path.resolve(__dirname, "../../database");
  const baseline = fs.readFileSync(path.join(directory, "schema.baseline.sql"), "utf8");
  const expected = JSON.parse(fs.readFileSync(path.join(directory, "schema.snapshot.json"), "utf8"));
  const config = connectionConfig();
  const name = `dby_stripe_test_${crypto.randomBytes(12).toString("hex")}`;
  function checkTarget() {
    if (!/^dby_stripe_test_[a-f0-9]{24}$/.test(name) || name === config.database) throw new Error("Unsafe sandbox database target.");
  }
  const temporary = path.join(os.tmpdir(), `${name}.sql`);
  const admin = new Pool(config);
  let created = false, written = false, pool;
  async function dispose() {
    try { await pool?.end(); } finally {
      try {
        if (created) { checkTarget(); await admin.query(`DROP DATABASE "${name}"`); created = false; }
      } finally {
        await admin.end();
        if (written) fs.rmSync(temporary, { force: true });
      }
    }
  }
  try {
    fs.writeFileSync(temporary, prepareRestoreSql(baseline), { flag: "wx" }); written = true;
    checkTarget();
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`); created = true;
    const dump = findPgDump();
    const psql = process.env.PSQL_PATH || (path.isAbsolute(dump)
      ? path.join(path.dirname(dump), process.platform === "win32" ? "psql.exe" : "psql") : "psql");
    await promisify(execFile)(psql, ["--no-psqlrc", "--no-password", "--single-transaction", "--set=ON_ERROR_STOP=1", `--file=${temporary}`], {
      env: { ...process.env, PGHOST: config.host, PGPORT: String(config.port), PGUSER: config.user,
        PGPASSWORD: config.password || "", PGDATABASE: name, PGCONNECT_TIMEOUT: "5" },
      timeout: 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
    });
    pool = new Pool({ ...config, database: name, max: 12 });
    const client = await pool.connect();
    let restored;
    try { restored = await inspectSchema(client); } finally { client.release(); }
    if (restored.missing.length || compareRestoredSchema(expected, restored).length) throw new Error("Disposable sandbox schema did not match the verified snapshot.");
    console.log(`Isolated database ready: ${name}`);
    return { pool, name, dispose };
  } catch (error) {
    try { await dispose(); } catch { console.error(`Sandbox cleanup requires review: ${name}`); }
    throw error;
  }
}

module.exports = { sandboxDatabase };
