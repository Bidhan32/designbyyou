const crypto = require("node:crypto");
const { normalizeSqlDefinition } = require("./sql-definition.cjs");

function analyzeBaseline(sql) {
  const tables = [...sql.matchAll(/^CREATE TABLE public\.([a-z_][a-z0-9_]*)\s*\(/gm)].map((match) => match[1]).sort();
  return {
    tables,
    functions: (sql.match(/^CREATE FUNCTION public\./gm) || []).length,
    triggers: (sql.match(/^CREATE TRIGGER /gm) || []).length,
    createsPublicSchema: /^CREATE SCHEMA public;\s*$/m.test(sql),
    needsUuidOssp: /\buuid_generate_v4\s*\(/.test(sql) &&
      !/^CREATE EXTENSION(?: IF NOT EXISTS)? "uuid-ossp"(?:\s|;)/m.test(sql),
  };
}

function prepareRestoreSql(sql) {
  const analysis = analyzeBaseline(sql);
  if (!analysis.tables.length) throw new Error("Baseline contains no recognized public table definitions.");
  if (!analysis.createsPublicSchema) throw new Error("Expected a pg_dump public-schema export; review this baseline format manually.");
  // Only the disposable restore copy changes. Keep the exported baseline intact.
  return sql.replace(/^CREATE SCHEMA public;\s*$/m,
    `CREATE SCHEMA IF NOT EXISTS public;${analysis.needsUuidOssp ? '\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;' : ""}`);
}

function verificationDatabaseName() {
  return `dby_schema_verify_${crypto.randomBytes(12).toString("hex")}`;
}

function assertVerificationTarget(name, sourceDatabase) {
  if (!/^dby_schema_verify_[a-f0-9]{24}$/.test(name) || name === sourceDatabase) {
    throw new Error("Refusing to manage a database outside this verification run.");
  }
}

function collectionDifferences(before, after, category) {
  const identity = category === "enums"
    ? (row) => row.name
    : (row) => `${row.table_name}.${row.name}`;
  const canonical = (row) => JSON.stringify(Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [key, key === "definition" ? normalizeSqlDefinition(value) : value])
    .sort(([a], [b]) => a.localeCompare(b))));
  const entries = (rows) => {
    const result = new Map();
    for (const row of rows || []) {
      const id = identity(row);
      if (category === "enums") {
        if (!result.has(id)) result.set(id, []);
        // Enum ordering is meaningful in PostgreSQL; do not sort labels.
        result.get(id).push(row.value);
      } else result.set(id, row);
    }
    return result;
  };
  const previous = entries(before);
  const current = entries(after);
  const differences = [];
  for (const [object, expected] of previous) {
    if (!current.has(object)) differences.push({ object, change: "missing", expected });
    else {
      const actual = current.get(object);
      const same = category === "enums"
        ? JSON.stringify(expected) === JSON.stringify(actual)
        : canonical(expected) === canonical(actual);
      if (!same) differences.push({ object, change: "changed", expected, actual });
    }
  }
  for (const [object, actual] of current) {
    if (!previous.has(object)) differences.push({ object, change: "unexpected", actual });
  }
  return differences;
}

function schemaCollectionDifferences(expected, restored) {
  return Object.fromEntries(["constraints", "indexes", "enums"].map((category) =>
    [category, collectionDifferences(expected[category], restored[category], category)]));
}

function compareRestoredSchema(expected, restored) {
  const key = (row) => `${row.table_schema}.${row.table_name}.${row.column_name}`;
  const actualColumns = new Map(restored.columns.map((column) => [key(column), column]));
  const issues = [];
  for (const column of expected.columns) {
    const other = actualColumns.get(key(column));
    if (!other) { issues.push(`Missing column: ${key(column)}`); continue; }
    for (const field of ["data_type", "udt_schema", "udt_name", "is_nullable", "column_default", "is_identity", "identity_generation", "is_generated", "generation_expression"]) {
      if (column[field] !== other[field]) issues.push(`Column ${field} differs: ${key(column)}`);
    }
  }
  const expectedColumns = new Set(expected.columns.map(key));
  for (const column of restored.columns) if (!expectedColumns.has(key(column))) issues.push(`Unexpected column: ${key(column)}`);
  for (const [category, differences] of Object.entries(schemaCollectionDifferences(expected, restored))) {
    if (differences.length) {
      issues.push(`Restored ${category} differ from the captured snapshot.`);
    }
  }
  return issues;
}

module.exports = { analyzeBaseline, prepareRestoreSql, verificationDatabaseName, assertVerificationTarget, compareRestoredSchema, schemaCollectionDifferences };
