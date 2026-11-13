# DesignByYou quality baseline

## Implemented and locally checked

- Route-level loading and recovery boundaries keep navigation available during page loading.
- 49 pages/layouts are deferred. `npm run check:bundle` enforces a 500 KB uncompressed startup JavaScript ceiling; current startup is about 103 KB gzip.
- Production static serving revalidates HTML and unversioned files; Vite's hashed assets use one-year immutable caching. Private API data is not included in this cache policy.
- Shared keyboard skip link, visible focus indication and reduced-motion CSS support.
- Creator/designer mobile drawers and standalone booking checkout contain keyboard focus, isolate background content, and restore trigger focus. Checkout blocks Escape while payment/verification is active. Mobile drawers close at the desktop breakpoint and scroll as a whole on short screens. These behaviors have component-level tests; real-device and screen-reader validation remains outstanding.
- One authentication provider restores the session. Existing backend ownership, role, payment and session tests remain the security baseline.
- `/health` remains the process liveness check. `/ready` and `/api/v1/ready` check database availability with a three-second response deadline and report 503 during shutdown. No connection information is exposed.
- GitHub Actions runs lint, frontend/backend tests, production build, bundle budget, static-serving checks and readiness tests after push/PR. Workflow execution has not yet been verified on GitHub.

## Release acceptance checks

| Area | Acceptance target | Remaining evidence |
| --- | --- | --- |
| Navigation and UI | A clear primary action and recoverable errors on each core journey | Walk through auth, discovery, editor, bookings and wallet in both roles |
| Speed | Target under 2 seconds for key page content; measure cold and warm loads separately | Deployed mobile performance measurements; large 3D assets still have additional loading cost |
| Mobile | No unintended horizontal scroll at 320, 375, 390, 768 and 1024 px; usable with keyboard open | Real Android/iOS checks, especially editor controls, dialogs and uploads |
| Accessibility | Keyboard access, focus order, dialog focus containment, labels, contrast, zoom and screen-reader output | Full screen audit; shared CSS and skip links do not establish WCAG conformance |
| Security | HTTPS, fresh role checks, ownership isolation, signed webhook verification | Production TLS/header checks, dependency scans and periodic independent review; no compliance certification claimed |
| Reliability | Readiness monitoring, alerts and verified recovery | Hosting configuration, backup schedule/retention, restore drill and uptime observation |
| Integrations | Safe retries and clear recovery from service failure | Stripe test-mode checkout/webhooks on the deployed environment and provider outage checks |

## Deployment follow-up

1. Deploy frontend and API together. The frontend start command must use the committed `serve.json`; custom Railway start-command overrides must be checked.
2. Configure the API deployment health check to `/ready`. Use an external monitor for ongoing availability and alerting; a deployment health check alone is not an uptime monitor.
3. Verify HTTPS on both domains. Check actual response headers before enabling additional strict policies; payment frames, image hosts and 3D resources must continue working.
4. Confirm database backup availability, schedule and retention in the hosting account. Restore a backup into a separate database and verify records before claiming recovery readiness.
5. Inspect CDN coverage and compression for frontend assets and media. Do not cache authenticated API responses at a shared CDN.
6. Measure performance on the deployed app with a mobile network profile and a real phone. Record route, device, network, cache state and metric. Do not equate JavaScript transfer size with load time.
7. Require the quality workflow checks in branch protection after their first successful run. Review dependencies regularly; automated tests are not a compliance audit.

No hosting settings, backup schedules, live payments or deployments were changed by this local baseline work.
