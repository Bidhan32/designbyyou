Add reviewed forward migrations as `0001_short_description.sql`, `0002_next_change.sql`, and so on.

0001_auth_sessions.sql adds server-enforced inactivity and logout revocation. See ../SESSION_SECURITY.md for deployment order.

The runner wraps each file and its journal entry in a transaction. Do not include transaction-control statements or commands that cannot run in a transaction, such as `CREATE INDEX CONCURRENTLY`. Keep already-applied files immutable; add a new migration for subsequent changes.
