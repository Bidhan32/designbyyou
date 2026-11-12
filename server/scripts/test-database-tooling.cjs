const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { connectionConfig, checkRequiredColumns, inspectSchema } = require("../database/schema-tools.cjs");
const { loadMigrations, planMigrations, migrationStatus, applyMigrations } = require("../database/migration-engine.cjs");
const { analyzeBaseline, prepareRestoreSql, verificationDatabaseName, assertVerificationTarget, compareRestoredSchema, schemaCollectionDifferences } = require("../database/baseline-tools.cjs");
const { normalizeSqlDefinition } = require("../database/sql-definition.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dby-migration-test-"));
  t.after(() => {
    // Only unlink the known, flat fixture directory; never recursively delete.
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  return directory;
}

function clientWith({ applied = [], failSql = null, locked = true, journal = false } = {}) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql === failSql) throw new Error("simulated SQL failure");
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
    if (sql.includes("to_regclass")) return { rows: [{ journal: journal ? "dby_schema_migrations" : null }] };
    if (sql.startsWith("SELECT name, checksum")) return { rows: applied };
    return { rows: [] };
  } };
}
const migrations = [{ name: "0001_example.sql", sql: "ALTER TABLE example ADD COLUMN title text;", checksum: "hash-one" }];

test("tool connection config uses server DB settings without a guessed target", () => {
  assert.throws(() => connectionConfig({}), /DB_HOST.*DB_DATABASE.*DB_USER/);
  const config = connectionConfig({ DB_HOST: "test-host", DB_DATABASE: "test-db", DB_USER: "test-user", DB_PORT: "5433" });
  assert.equal(config.database, "test-db");
  assert.equal(config.port, "5433");
  assert.equal(config.connectionTimeoutMillis, 5000);
});

test("readiness check distinguishes a missing table from the legacy editor owner field", () => {
  const requirements = { editor_projects: ["owner_id", "version"], users: ["id"] };
  const columns = [
    { table_schema: "public", table_name: "editor_projects", column_name: "creator_id" },
    { table_schema: "public", table_name: "editor_projects", column_name: "version" },
    { table_schema: "other_schema", table_name: "users", column_name: "id" },
  ];
  assert.deepEqual(checkRequiredColumns(columns, requirements), [
    { table: "editor_projects", column: "owner_id", problem: "missing_column" },
    { table: "users", problem: "missing_table" },
  ]);
});

test("inspection uses a consistent read-only transaction and queries metadata only", async () => {
  const calls = [];
  const snapshot = await inspectSchema({ query: async (sql) => {
    calls.push(sql);
    return { rows: sql.includes("server_version") ? [{ version: "18" }] : [] };
  } });
  assert.equal(calls[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(calls.at(-1), "COMMIT");
  for (const sql of calls.filter((sql) => sql.startsWith("SELECT"))) {
    assert.match(sql, /current_setting|information_schema|pg_constraint|pg_indexes|pg_type/);
  }
  assert.equal(snapshot.postgres, "18");
  assert.ok(snapshot.missing.length > 0);
});

test("inspection failure rolls back", async () => {
  const calls = [];
  await assert.rejects(inspectSchema({ query: async (sql) => {
    calls.push(sql);
    if (sql.includes("server_version")) throw new Error("metadata unavailable");
    return { rows: [] };
  } }), /metadata unavailable/);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("migration checksums survive Windows versus Unix checkout line endings", (t) => {
  const directory = fixture(t);
  const file = path.join(directory, "0001_example.sql");
  fs.writeFileSync(file, "SELECT 1;\r\nSELECT 2;\r\n");
  const first = loadMigrations(directory)[0];
  fs.writeFileSync(file, "SELECT 1;\nSELECT 2;\n");
  assert.equal(loadMigrations(directory)[0].checksum, first.checksum);
});

test("duplicate versions are rejected before database work", (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, "0001_first.sql"), "SELECT 1;");
  fs.writeFileSync(path.join(directory, "0001_second.sql"), "SELECT 2;");
  assert.throws(() => loadMigrations(directory), /Duplicate migration version/);
});

test("transaction controls are rejected without blocking dollar-quoted functions", (t) => {
  const directory = fixture(t);
  const file = path.join(directory, "0001_function.sql");
  fs.writeFileSync(file, "-- COMMENT\nCREATE FUNCTION demo() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN RETURN; END; $body$;");
  assert.equal(loadMigrations(directory).length, 1);
  for (const sql of ["BEGIN; SELECT 1; COMMIT;", "SELECT 1; /* nested /* comment */ comment */ COMMIT;", "SELECT 'literal; COMMIT;'; END;"]) {
    fs.writeFileSync(file, sql);
    assert.throws(() => loadMigrations(directory), /must not control transactions/);
  }
});

test("modified, missing, and reordered applied migration files are rejected", () => {
  assert.throws(() => planMigrations(migrations, [{ ...migrations[0], checksum: "modified" }]), /was modified/);
  assert.throws(() => planMigrations([], migrations), /missing from this checkout/);
  assert.throws(() => planMigrations(migrations, [{ name: "0000_older.sql" }]), /history differs/);
});

test("status does not create a migration journal", async () => {
  const client = clientWith();
  assert.deepEqual(await migrationStatus(client, migrations), { applied: [], pending: ["0001_example.sql"] });
  assert.match(client.calls[0].sql, /READ ONLY/);
  assert.equal(client.calls.some(({ sql }) => /CREATE|INSERT|UPDATE|DELETE/.test(sql)), false);
});

test("successful migration and journal insertion share one transaction", async () => {
  const client = clientWith();
  assert.deepEqual(await applyMigrations(client, migrations), ["0001_example.sql"]);
  const commands = client.calls.map(({ sql }) => sql);
  assert.ok(commands.indexOf("BEGIN") < commands.indexOf(migrations[0].sql));
  const journalIndex = commands.findIndex((sql) => sql.startsWith("INSERT INTO"));
  assert.ok(journalIndex > commands.indexOf(migrations[0].sql));
  assert.ok(journalIndex < commands.indexOf("COMMIT"));
  assert.deepEqual(client.calls[journalIndex].values, [migrations[0].name, migrations[0].checksum]);
  assert.match(commands.at(-1), /pg_advisory_unlock/);
});

test("failed migration rolls back without recording success and releases its lock", async () => {
  const client = clientWith({ failSql: migrations[0].sql });
  await assert.rejects(applyMigrations(client, migrations), /simulated SQL failure/);
  assert.ok(client.calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(client.calls.some(({ sql }) => sql.startsWith("INSERT INTO")), false);
  assert.equal(client.calls.some(({ sql }) => sql === "COMMIT"), false);
  assert.match(client.calls.at(-1).sql, /pg_advisory_unlock/);
});

test("another runner's lock prevents all schema changes", async () => {
  const client = clientWith({ locked: false });
  await assert.rejects(applyMigrations(client, migrations), /Another migration runner/);
  assert.equal(client.calls.length, 1);
});

test("already applied migrations are never replayed", async () => {
  const client = clientWith({ journal: true, applied: migrations });
  assert.deepEqual(await applyMigrations(client, migrations), []);
  assert.equal(client.calls.some(({ sql }) => sql === "BEGIN" || sql.startsWith("CREATE")), false);
});

test("disposable restore handles public and missing UUID extension without rewriting the original export", () => {
  const baseline = 'CREATE SCHEMA public;\nCREATE TABLE public.users (id uuid DEFAULT public.uuid_generate_v4());\n';
  const prepared = prepareRestoreSql(baseline);
  assert.match(prepared, /CREATE SCHEMA IF NOT EXISTS public;/);
  assert.match(prepared, /CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;/);
  assert.ok(prepared.indexOf("CREATE EXTENSION") < prepared.indexOf("CREATE TABLE"));
  assert.equal(baseline.includes("IF NOT EXISTS"), false);
  assert.deepEqual(analyzeBaseline(baseline).tables, ["users"]);
  assert.equal(analyzeBaseline('CREATE EXTENSION "uuid-ossp" WITH SCHEMA public;\n' + baseline).needsUuidOssp, false);
  assert.throws(() => prepareRestoreSql("SELECT 1;"), /no recognized public table/);
});

test("verification cleanup accepts only its generated disposable target", () => {
  const name = verificationDatabaseName();
  assert.doesNotThrow(() => assertVerificationTarget(name, "application_database"));
  assert.throws(() => assertVerificationTarget(name, name), /Refusing/);
  assert.throws(() => assertVerificationTarget("application_database", "application_database"), /Refusing/);
  assert.throws(() => assertVerificationTarget('dby_schema_verify_123"; DROP DATABASE app;', "app"), /Refusing/);
});

test("restore comparison detects constraint loss even when required columns exist", () => {
  const column = { table_schema: "public", table_name: "users", column_name: "id", data_type: "uuid", is_nullable: "NO" };
  const expected = { columns: [column], constraints: [{ name: "users_pkey", type: "p", definition: "PRIMARY KEY (id)" }], indexes: [], enums: [] };
  assert.deepEqual(compareRestoredSchema(expected, { ...expected }), []);
  assert.match(compareRestoredSchema(expected, { ...expected, constraints: [] })[0], /constraints differ/);
  assert.match(compareRestoredSchema(expected, { ...expected, columns: [{ ...column, is_nullable: "YES" }] })[0], /is_nullable differs/);
});

test("schema diagnostics identify missing, changed, and unexpected objects with definitions", () => {
  const first = { table_name: "wallets", name: "balance_check", type: "c", definition: "CHECK (balance >= 0)" };
  const missing = { table_name: "wallets", name: "wallet_unique", definition: "UNIQUE (user_id)" };
  const changed = { ...first, definition: "CHECK (balance > 0)" };
  const extra = { table_name: "wallets", name: "extra_check", definition: "CHECK (balance < 100)" };
  const details = schemaCollectionDifferences({ constraints: [first, missing], indexes: [], enums: [] },
    { constraints: [changed, extra], indexes: [], enums: [] });
  assert.deepEqual(details.constraints, [
    { object: "wallets.balance_check", change: "changed", expected: first, actual: changed },
    { object: "wallets.wallet_unique", change: "missing", expected: missing },
    { object: "wallets.extra_check", change: "unexpected", actual: extra },
  ]);
});

test("object ordering is irrelevant, but PostgreSQL enum label ordering is preserved", () => {
  const first = { table_name: "users", name: "users_pkey", definition: "PRIMARY KEY (id)" };
  const second = { table_name: "users", name: "users_email_key", definition: "UNIQUE (email)" };
  const expected = { columns: [], constraints: [first, second], indexes: [], enums: [{ name: "status", value: "pending" }, { name: "status", value: "completed" }] };
  assert.deepEqual(compareRestoredSchema(expected, { ...expected, constraints: [second, first] }), []);
  assert.match(compareRestoredSchema(expected, { ...expected, enums: [...expected.enums].reverse() })[0], /enums differ/);
});

test("restore comparison accepts distributed unbounded varchar-to-text array casts", () => {
  const source = "CHECK (status::text = ANY (ARRAY['pending'::character varying, 'paid'::character varying]::text[]))";
  const restored = "CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'paid'::character varying::text]))";
  assert.equal(normalizeSqlDefinition(source), normalizeSqlDefinition(restored));
  const indexSource = "CREATE UNIQUE INDEX one_open ON public.payouts USING btree (request_id) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying])::text[]))";
  const indexRestored = "CREATE UNIQUE INDEX one_open ON public.payouts USING btree (request_id) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('paid'::character varying)::text]))";
  assert.equal(normalizeSqlDefinition(indexSource), normalizeSqlDefinition(indexRestored));
});

test("cast normalization preserves values, predicates, index keys, and uniqueness", () => {
  const original = "CREATE UNIQUE INDEX one_open ON public.payouts USING btree (request_id) WHERE (status::text = ANY (ARRAY['pending'::character varying]::text[]))";
  const normalized = normalizeSqlDefinition(original);
  for (const changed of [
    original.replace("'pending'", "'failed'"),
    original.replace("CREATE UNIQUE INDEX", "CREATE INDEX"),
    original.replace("(request_id)", "(user_id)"),
    original.replace(" = ANY", " <> ANY"),
    original.replace("status::text", "other_status::text"),
  ]) assert.notEqual(normalizeSqlDefinition(changed), normalized);
});

test("bounded casts, nonliteral elements, and varchar arrays without a text cast stay strict", () => {
  for (const definition of [
    "ARRAY['pending'::character varying(3)]::text[]",
    "ARRAY['pending'::character(3)]::text[]",
    "ARRAY[status::character varying]::text[]",
    "ARRAY['pending'::character varying]",
    "ARRAY[NULL::character varying]::text[]",
  ]) assert.equal(normalizeSqlDefinition(definition), definition);
});

test("SQL literals, quoted identifiers, and comments are not rewritten", () => {
  for (const definition of [
    "CHECK (note = 'ARRAY[''pending''::character varying]::text[]')",
    '"ARRAY[pending::character varying]::text[]"',
    "$body$ARRAY['pending'::character varying]::text[]$body$",
    "/* ARRAY['pending'::character varying]::text[] */ SELECT 1",
    "-- ARRAY['pending'::character varying]::text[]\nSELECT 1",
  ]) assert.equal(normalizeSqlDefinition(definition), definition);
  const escaped = "ARRAY['it''s, [pending]'::character varying]::text[]";
  assert.equal(normalizeSqlDefinition(escaped), "ARRAY['it''s, [pending]'::text]");
});
