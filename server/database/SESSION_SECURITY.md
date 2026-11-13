# Session deployment

Apply `0001_auth_sessions.sql` through the migration runner **before deploying the new backend**:

```sh
npm run db:status
npm run db:migrate
```

Run from `server` using the intended database connection. The migration adds a table and indexes only; never replay schema.baseline.sql on production. Back up production before schema changes. Deploy the backend and frontend together after migration. Tokens from before this release require a fresh login.

Sessions expire after five hours without a browser activity heartbeat, or after 24 hours regardless of activity. A shorter JWT_EXPIRES_IN remains supported. Expiration is checked using PostgreSQL time on every protected request. Autosave, polling and session checks do not renew sessions. Browser input heartbeats are batched, so activity timestamps have up to 30 seconds of granularity. Tabs share the token and synchronize login/logout; different devices have separate sessions.

Logout revokes the current session on the server. Password changes/resets retain the existing global token-version revocation. A network failure during logout can only clear the local browser; server revocation cannot be guaranteed until connectivity returns or expiry occurs. Requests already authorized before logout may finish.

Bearer tokens remain in localStorage for compatibility. This is not an HttpOnly-cookie conversion: an XSS attacker can still steal tokens, and someone holding a token can simulate activity until its absolute expiry. Idle expiry does not replace XSS prevention, TLS or account authorization. In offline/sleeping browsers the UI may remain visible until the next session check; the server still rejects expired requests.

The frontend checks every 30 seconds and on return to a visible tab. Outages do not delete credentials. A five-minute warning helps users save work before expiry. No payment or unsaved editor state is deliberately discarded by the warning.

Expired rows may be pruned by a scheduled maintenance job, for example `DELETE FROM auth_sessions WHERE expires_at < now() - interval '7 days'`; this is not required for enforcement. No raw tokens, IP addresses or device fingerprints are stored in the table.

Validation: `npm run test:auth:sandbox` uses a disposable database, applies the migration, exercises actual HTTP authentication/expiry/logout/concurrency, and removes the database afterward. Frontend lifecycle tests: `node --test scripts/test-session-monitor.mjs` from `dby`.
