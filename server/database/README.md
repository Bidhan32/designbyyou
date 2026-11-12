# Database baseline and migrations

The schema export and inspection snapshot have been captured locally from PostgreSQL 18.3. Static review found 48 public tables and no missing minimum critical-path columns. The reviewed financial tables include nonnegative wallet checks and unique payment/idempotency keys. This does not prove financial integration behavior or a successful fresh-database restore. Direct database access from the agent environment remains blocked with `EACCES`.

Run these commands from the `server` directory on a machine that can access the configured database:

```powershell
npm run db:inspect
npm run db:status
npm run db:export
```

All three commands read the database. They load `server/.env` regardless of the current directory and use the same `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, and `DB_PASSWORD` settings as the server. Existing process environment settings take precedence. Connection attempts time out after five seconds.

`db:inspect` writes `database/schema.snapshot.json`: public column definitions, constraints, indexes, enum labels, and a minimum critical-path column check. It does not select application rows. A successful connection with missing required structures exits with code 2; connection/inspection failure exits with code 1. A clean column check is not a full financial-integrity or migration-readiness audit. Constraints, defaults, types, unique indexes, functions, and triggers still need review against application behavior.

The contract uses the current controllers, including `editor_projects.owner_id`, `project_data`, and `version`. It also checks the pattern and costume extractor job tables. Do not substitute older schema descriptions for these current code requirements.

`db:status` reports applied and pending migrations inside a read-only transaction. It does not create a journal table. `db:export` invokes PostgreSQL's `pg_dump` with `--schema-only --schema=public --no-owner --no-privileges`. It discovers PostgreSQL installations on Windows, accepts `PG_DUMP_PATH` for a specific executable, and uses `pg_dump` from PATH elsewhere. Passwords are passed through the child-process environment rather than command arguments. An existing baseline is never overwritten.

## Establish the actual baseline

1. Run inspection and export against the intended database. Review `schema.snapshot.json` and `schema.baseline.sql`; resolve reported gaps only after confirming the intended schema and current data.
2. Check required extensions and any application objects outside `public`; the scoped baseline does not include other application schemas, roles, or grants. Record those prerequisites separately. Use a complete schema dump if the application depends on other schemas.
3. Run `npm run db:verify`. It creates a randomly named `dby_schema_verify_...` database on the configured server, restores with `psql --single-transaction --set=ON_ERROR_STOP=1`, compares schema metadata with the captured snapshot, then drops only its disposable database. The configured database is used solely for administrative CREATE/DROP DATABASE commands; its tables and rows are not modified. The database user must have permission to create databases. Restore diagnostics go to the ignored `database/schema.verify.log` if needed.
4. Review the verifier result. Application integration checks need a separately provisioned test database because the verifier deletes its disposable schema copy after inspection. Commit the reviewed baseline after restore validation and add forward migrations when a concrete schema change is needed. A schema export is not a data backup; retain a tested backup before changing a database containing user data.

The current export explicitly creates `public`, and seven UUID defaults reference `uuid_generate_v4()` although the scoped dump does not include the `uuid-ossp` extension. The verifier adjusts only its temporary restore copy: `CREATE SCHEMA IF NOT EXISTS public` and installation of `uuid-ossp` in the disposable database. The original export is preserved. These are restore prerequisites, not evidence that the existing database is missing the extension. A standard PostgreSQL installation must provide the extension's server-side files. Set `PSQL_PATH` if the PostgreSQL client is not found beside `pg_dump` or on PATH.

Duplicate legacy indexes were also observed, notably multiple indexes on transaction Stripe intent IDs and booking participant IDs. No index-removal migration has been created: some indexes support constraints, and cleanup requires a separate dependency review.

PostgreSQL may restore a string-literal array cast from `ARRAY['pending'::character varying]::text[]` as `ARRAY['pending'::character varying::text]`. The verifier normalizes this specific equivalent form for constraint and index definitions. It preserves values, index columns, uniqueness, predicates, enum order, and other casts; bounded string casts and nonliteral arrays are not normalized. The saved restored snapshot can also be compared offline without connecting to a database. Detailed mismatch logs retain the original definitions.

## Forward migrations

```powershell
npm run db:status
npm run db:migrate
```

`db:migrate` is an explicit write operation. It is never called by application startup or deployment scripts. It refuses to proceed without a local baseline file. Each pending migration and its checksum record are committed together; a failure rolls back that file. A session advisory lock prevents two runners from applying changes simultaneously. Lock waits and SQL execution have bounded timeouts. Modified, missing, reordered, or duplicate-version migration files are rejected. Windows and Unix line endings produce the same checksum.

The journal is `public.dby_schema_migrations`. It tracks forward migrations only: do not place the exported baseline in `migrations/` or replay it against an existing database. The presence of a baseline file alone does not verify that a target database matches it; finish the baseline review and restore checks first. There is no automatic down/rollback migration command.
