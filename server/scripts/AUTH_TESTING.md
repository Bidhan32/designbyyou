# Authentication and account access checks

Run from `server`:

```powershell
npm run test:auth
npm run test:auth:sandbox
```

The offline suite tests JWT validation, fresh account state, role gates, suspended login, bcrypt byte limits, password-change reset-code invalidation, chat initialization, login throttling, and anonymous rejection across 97 route/method pairs. It dispatches through real Express routers in process without opening network connections.

The sandbox suite needs the same PostgreSQL credentials, create-database permission, `psql`, and reviewed schema baseline used by the other sandbox checks. It creates a randomly named disposable database, restores the baseline, serves the real application on a random loopback port, and uses synthetic accounts only. Email is intercepted in memory; no mail is sent. Stripe calls are forbidden. It tests registration, verification/resend, reset expiry and concurrent consumption, password changes and session revocation, profile ownership/privacy, private editor access, and chat membership. It removes its database on normal success or failure and writes `auth-sandbox-report.json` without passwords, tokens, or OTPs. A forced process termination can prevent cleanup.

Offline results do not establish that the database suite passed. A connection failure such as EACCES must be resolved by running the sandbox locally. Review any failed step and cleanup result before continuing.

This is scoped regression coverage, not proof that every application permission is correct. Real email inbox delivery, browser registration/reset interactions, deployed proxy/rate-limit behavior, multi-instance rate limiting, and websocket access require separate verification. Payment and payout authorization retain their separate sandbox suites. Browser Stripe checkout and 3DS remain pending.

Password policy: new passwords must contain at least 8 characters and at most 72 UTF-8 bytes, because bcrypt truncates longer input. Login also rejects longer inputs. Existing users who relied on an overlong password need to use password recovery to set one within the limit.
