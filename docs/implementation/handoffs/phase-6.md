# Phase 6 · Pilot and release

This audit reviews O6 and S6 in the commit that introduced this file and the local E6 evidence from `1f3cad0`, `4d10077` and `6dcd6f2`.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Build a common API and worker image | `Dockerfile`, `deploy/api.railway.toml`, `deploy/worker.railway.toml` | Built with the cloud HTTPS proxy and trusted CA. Both non-root container entry points reported database readiness. The build was corrected to give the Node user ownership when the checkout is created with restrictive file modes. |
| Preserve private app routes and separate origins | `apps/app/wrangler.toml`, `apps/app/public/_headers`, `apps/api/src/config.ts` | The private build and browser deep-link refresh worked locally. Running on the configured Cloudflare/Railway hostnames requires deployment approval. |
| Observe jobs and restore the database | `apps/api/src/operations.ts`, `docs/implementation/runbook.md` | The status command returned structured job groups and coverage gap counts. A disposable PostgreSQL restore held 13 entries and EUR 230.00. A signed replay queued while the worker was stopped, completed after restart, and a fresh signed-in API session still saw EUR 230.00. |
| Keep platform billing separate | `apps/api/src/billing/billing.ts`, `apps/api/prisma/migrations/20261125006000_platform_subscription`, `apps/app/src/features/billing/Billing.vue` | A signed synthetic test subscription became active, then past due. Duplicate and older deliveries left billing correct. The rep received 404. The EUR balance and sales ledger were unchanged. Hosted checkout and portal require a test Stripe account and price. |
| Rehearse shared statement and review | [Phase 4](phase-4.md) and [Phase 5](phase-5.md) | Local founder and rep explained the same EUR 230.00 balance and traced the signed Stripe fixture. Local sample refund entry `86b0e644-a27d-454f-b5a0-b28ac90f8f55` posted −2,000 minor units and external payment entry `f0d6e6f0-daaf-4b72-b9eb-db0474758a77` posted −15,000. An overlapping RevenueCat fixture was classified as secondary. |

Pending external evidence belongs to the founder and release operator. A real pilot needs an agreed product and terms, an approved opening balance and coverage start, and one monthly statement reconciled with both participants. Deployed Resend sign-in needs a verified sender, API key, and approved deployment. Sandbox provider proof needs account-specific test credentials and historical records. Hosted subscription checkout needs a separate Stripe test account, price and configured portal. Keep live checkout disabled until commercial approval.

The billing test now exercises the real Stripe SDK against a loopback server. It verifies that the founder's Checkout and Portal requests use the separate platform customer, price and account credential. A retry reuses the Stripe idempotency key. Unauthorized requests never reach Stripe. Opening and completing a hosted session and observing the resulting provider webhook still require the Stripe test account.

For the first real monthly statement, record the approved product, provider, coverage start, opening amount by currency, time zone, due rule, commission basis, and refund and amendment policy. Compare sale and refund IDs to statement lines, external payments to the founder's records, and the ending balance and due date across both sessions. Record the number of manual matches, elapsed time to agreement, and any unresolved item with its owner. Keep only anonymized examples in the repository.

See [phase 7](phase-7.md) for the website audit. The external pilot evidence remains open.
