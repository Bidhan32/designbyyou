const fs = require("node:fs");
const path = require("node:path");
const contract = require("./schema-contract.cjs");

function connectionConfig(env = process.env) {
  const missing = ["DB_HOST", "DB_DATABASE", "DB_USER"].filter((name) => !env[name]);
  if (missing.length) throw new Error(`Configure ${missing.join(", ")} in server/.env.`);
  return {
    host: env.DB_HOST, database: env.DB_DATABASE, user: env.DB_USER,
    password: env.DB_PASSWORD, port: env.DB_PORT || 5432,
    connectionTimeoutMillis: 5000, max: 1,
  };
}

function checkRequiredColumns(columns, requirements = contract) {
  const tables = new Map();
  for (const column of columns) {
    if (column.table_schema !== "public") continue;
    if (!tables.has(column.table_name)) tables.set(column.table_name, new Set());
    tables.get(column.table_name).add(column.column_name);
  }
  const missing = [];
  for (const [table, names] of Object.entries(requirements)) {
    if (!tables.has(table)) missing.push({ table, problem: "missing_table" });
    else for (const column of names) {
      if (!tables.get(table).has(column)) missing.push({ table, column, problem: "missing_column" });
    }
  }
  return missing;
}

async function inspectSchema(client) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '10s'");
    const version = await client.query("SELECT current_setting('server_version') AS version");
    const columns = await client.query(`SELECT table_schema, table_name, column_name,
      ordinal_position, data_type, udt_schema, udt_name, is_nullable, column_default,
      is_identity, identity_generation, is_generated, generation_expression
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`);
    const constraints = await client.query(`SELECT c.relname AS table_name, co.conname AS name,
      co.contype AS type, pg_get_constraintdef(co.oid, true) AS definition
      FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      ORDER BY c.relname, co.conname`);
    const indexes = await client.query(`SELECT tablename AS table_name, indexname AS name,
      indexdef AS definition FROM pg_indexes WHERE schemaname = 'public'
      ORDER BY tablename, indexname`);
    const enums = await client.query(`SELECT t.typname AS name, e.enumlabel AS value
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder`);
    await client.query("COMMIT");
    return {
      format: 1, captured_at: new Date().toISOString(), postgres: version.rows[0].version,
      scope: "public schema metadata; minimum critical-path column checks only",
      columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows,
      enums: enums.rows, missing: checkRequiredColumns(columns.rows),
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Keep the inspection error. */ }
    throw error;
  }
}

function findPgDump(env = process.env) {
  if (env.PG_DUMP_PATH) return env.PG_DUMP_PATH;
  const base = path.join(env.ProgramFiles || "C:\\Program Files", "PostgreSQL");
  if (process.platform === "win32" && fs.existsSync(base)) {
    for (const version of fs.readdirSync(base).filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a))) {
      const executable = path.join(base, version, "bin", "pg_dump.exe");
      if (fs.existsSync(executable)) return executable;
    }
  }
  return "pg_dump";
}

module.exports = { connectionConfig, checkRequiredColumns, inspectSchema, findPgDump };
