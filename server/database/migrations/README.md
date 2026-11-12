Add reviewed forward migrations as `0001_short_description.sql`, `0002_next_change.sql`, and so on.

This directory intentionally contains no SQL yet. A real schema export and snapshot are available locally and have been reviewed statically; a disposable restore still needs verification. Do not add a migration merely to populate this directory or reconstruct the baseline by guessing from controller queries.

The runner wraps each file and its journal entry in a transaction. Do not include transaction-control statements or commands that cannot run in a transaction, such as `CREATE INDEX CONCURRENTLY`. Keep already-applied files immutable; add a new migration for subsequent changes.
