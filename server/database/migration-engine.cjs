const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Check only top-level transaction controls, leaving quoted routine bodies alone.
// SQL files are trusted, reviewed code; this prevents accidental early commits.
function validateMigrationSql(sql, name) {
  let visible = "";
  for (let index = 0; index < sql.length;) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      index = end < 0 ? sql.length : end;
      visible += " ";
    } else if (sql.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith("/*", index)) { depth++; index += 2; }
        else if (sql.startsWith("*/", index)) { depth--; index += 2; }
        else index++;
      }
      if (depth) throw new Error(`Unclosed SQL comment: ${name}`);
      visible += " ";
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      const escaped = quote === "'" && /(?:^|\W)[eE]$/.test(sql.slice(0, index));
      index++;
      let closed = false;
      while (index < sql.length) {
        if (escaped && sql[index] === "\\") { index += 2; continue; }
        if (sql[index++] === quote) {
          if (sql[index] === quote) { index++; continue; }
          closed = true;
          break;
        }
      }
      if (!closed) throw new Error(`Unclosed SQL quote: ${name}`);
      visible += " ";
    } else {
      const dollar = sql.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      if (dollar) {
        const end = sql.indexOf(dollar, index + dollar.length);
        if (end < 0) throw new Error(`Unclosed SQL routine body: ${name}`);
        index = end + dollar.length;
        visible += " ";
      } else visible += sql[index++];
    }
  }
  if (!visible.replace(/;/g, "").trim()) throw new Error(`Empty migration: ${name}`);
  for (const statement of visible.split(";")) {
    if (/^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i.test(statement)) {
      throw new Error(`Migration must not control transactions: ${name}`);
    }
  }
}

function loadMigrations(directory) {
  const versions = new Set();
  return fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort().map((name) => {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    const version = name.slice(0, 4);
    if (versions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    versions.add(version);
    const file = path.join(directory, name);
    if (!fs.lstatSync(file).isFile()) throw new Error(`Migration must be a regular file: ${name}`);
    const sql = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    validateMigrationSql(sql, name);
    return { name, sql, checksum: crypto.createHash("sha256").update(sql).digest("hex") };
  });
}

function planMigrations(migrations, applied) {
  if (applied.length > migrations.length) throw new Error("The database contains migrations missing from this checkout.");
  for (let index = 0; index < applied.length; index++) {
    const previous = applied[index];
    const local = migrations[index];
    if (previous.name !== local.name) throw new Error("Migration history differs from this checkout. Do not reorder or remove applied files.");
    if (previous.checksum !== local.checksum) throw new Error(`Applied migration was modified: ${previous.name}`);
  }
  return migrations.slice(applied.length);
}

async function readApplied(client) {
  const exists = await client.query("SELECT to_regclass('public.dby_schema_migrations') AS journal");
  if (!exists.rows[0].journal) return [];
  const result = await client.query("SELECT name, checksum FROM public.dby_schema_migrations ORDER BY name");
  return result.rows;
}

async function migrationStatus(client, migrations) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const applied = await readApplied(client);
    const pending = planMigrations(migrations, applied);
    await client.query("COMMIT");
    return { applied: applied.map((item) => item.name), pending: pending.map((item) => item.name) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Keep the original error. */ }
    throw error;
  }
}

async function applyMigrations(client, migrations) {
  const lock = await client.query("SELECT pg_try_advisory_lock(189732, 915715) AS locked");
  if (!lock.rows[0].locked) throw new Error("Another migration runner is active.");
  try {
    const pending = planMigrations(migrations, await readApplied(client));
    const completed = [];
    for (const migration of pending) {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query(`CREATE TABLE IF NOT EXISTS public.dby_schema_migrations (
          name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
        )`);
        await client.query(migration.sql);
        await client.query("INSERT INTO public.dby_schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, migration.checksum]);
        await client.query("COMMIT");
        completed.push(migration.name);
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* Keep the migration error. */ }
        throw error;
      }
    }
    return completed;
  } finally {
    await client.query("SELECT pg_advisory_unlock(189732, 915715)");
  }
}

module.exports = { loadMigrations, planMigrations, migrationStatus, applyMigrations };
