# NestJS API and worker

Run apps/api as two processes from one Docker image. The HTTP entry point owns sessions, authorization, DTO validation and durable ingress. The worker owns asynchronous mail, normalization, backfills, reconciliation and commission posting. PostgreSQL is the shared durable store. Keep packages/contracts independent of Nest, Prisma and provider SDKs.

## Modules and entry points

| Slice | Nest module | Implementation sequence |
|---|---|---|
| T0/C0 | Config, Database, Contracts | Validate configuration at startup, initialize Prisma, add process-specific readiness and request IDs. Mount the versioned API under /v1. Expose a minimal readiness route outside the versioned product API. |
| A1 | Auth, Mail | Request link → generate random token → persist digest and mail job → Resend. Serve confirmation UI on a safe GET. On user-confirmed POST, conditionally consume the digest, create or reuse user and insert revocable session. Sign-out revokes session and clears cookie. |
| B2 | Companies, Engagements, Invitations, Agreements, Claims | Implement company membership, both invitation directions, immutable proposals, revision-aware acceptance, claim decisions and engagement closure. Use resource-scoped guards and one transactional application service per state transition. |
| I3/P1–P4 | Connections, Inbox, Jobs, Providers | Resolve connection from route, authenticate the raw body, verify the claimed account/environment and persist inbox plus job. Normalize each product line, preserving stable source identity across retries/history imports. |
| F5/R5 | Attribution, Reconciliation | Apply product authority and customer links. Queue unmatched effects. Founder decisions lock the source record and write resolution, audit and follow-up work together. Track coverage and imports per connection. |
| L4 | Ledger, Statements, ExternalPayments | Resolve eligible terms, post signed effects, link refunds, expose role-safe statement reads. The external-payment command only records an already completed payment. |
| S6 | PlatformBilling | Founder-only Stripe test checkout and portal; synchronize company subscription state through its own authenticated billing webhook, credentials and event namespace. |
| O6 | Operations | Run migrations once. Expose job age, sync watermark, error counts and correlation IDs. Provide scoped replay and a database restore runbook. |

Controllers call application services and map results to named response DTOs. Services own transaction boundaries, resource authorization and state transitions. Provider adapters emit normalized data; only ledger services post commission. API serializers allowlist fields. A raw SDK or Prisma result must never become an HTTP response accidentally.

## Identity, tenancy and mail

Session authentication resolves an app_user. A founder acts through company_founder. A rep acts through engagement.rep_id. Access to an invitation binds to its recipient's verified address; revocation binds to its sender. A foreign resource identifier returns 404, while a visible resource with a forbidden action returns 403. Apply the same scoping to aggregates, bulk lists, review candidates and exports of individual entries. Verify exact trusted browser origins on cookie-authenticated mutations and restrict CORS credentials to the configured app origin.

Set a 15-minute link expiry for the pilot. Send a fragment-based token to the app confirmation page, remove it from the address bar after reading and keep it transiently in memory. Opening the page does not exchange it. Use short-lived encrypted mail-job payloads if asynchronous delivery needs the token; purge after delivery/expiry and redact logs. Keep only the digest for authentication. Do the same for invitation secrets. Return generic accepted responses on link requests and throttle by address and IP. The live reply, browser source and logs must exclude all session secrets.

## Ingestion and adapter handoff

Each adapter exposes verifyDelivery(rawBytes, headers, configuredConnection), normalize(verifiedEnvelope) and importPage(connection, cursor, window). Return a normalized collection, refund, refund reversal, nonfinancial event, or a review reason. Use the credential type documented by that provider. RevenueCat uses a configured authorization header; Stripe webhooks use endpoint signing secrets. Use Dodo and Whop's verification mechanisms for their installed webhook configurations. Keep transport authentication separate from source account, environment and currency checks. Provider-specific edge cases and primary docs are in the [adapter briefs](../implementation/commissions.md).

A stable financial key uses source account, environment, transaction, line, and economic effect identifier. An envelope ID deduplicates delivery only. A webhook and historical import for one payment must produce the same economic key. One authoritative connection per product/channel/environment determines eligibility. A secondary-source observation stays available as evidence. Unknown tax, unallocatable invoice refunds, or unverified coverage stay reviewable. Reconnect to the original external account or create a new connection with its own coverage period.

Sequence for each worker batch: lease job → load and normalize → start transaction → lock affected records → upsert effects → apply known mappings → post eligible entries or create review items → save checkpoint and complete lease → commit. Retry transient failures with bounded backoff. Authentication or malformed payload failures receive explicit status. Persistent failures expose a reason and remain eligible for operator replay after repair.

## Provider-to-ledger contract

Return one normalized effect per economic change to a product line. Provider adapters supply stable source keys and positive magnitudes; the ledger supplies signs. Use a synthetic fixture such as the following for a collection. A refund changes kind and effectKey and supplies originalExternalKey. The worker must derive the same key from a historical API response even when that response has no webhook event ID.

~~~json
{
  "transactionKey": "invoice_fixture_01",
  "lineKey": "line_fixture_A",
  "effectKey": "collected_fixture_01",
  "kind": "collection",
  "externalProduct": "plan_fixture_monthly",
  "externalCustomer": "customer_fixture_01",
  "channel": "web",
  "occurredAt": "2026-11-03T12:00:00Z",
  "currency": "EUR",
  "amountMinor": "24000",
  "basisMinor": "20000"
}
~~~

The example uses a known €40 tax component. With accepted terms of 2,000 basis points, post +4,000 minor units. If the source only reports a €240 gross estimate, omit basisMinor and create a review item. Do not infer a tax rate from the sample.

## Runtime configuration

| Process | Configuration groups | Startup behavior |
|---|---|---|
| API | DATABASE_URL, APP_ORIGIN, API_ORIGIN, secret-encryption key reference, session TTL, enabled provider configuration | Verify required configuration. Restrict request body sizes and preserve raw webhook bytes. Include a request ID in logs and responses. Health responses expose availability only. |
| Worker | DATABASE_URL, encryption-key access, Resend sender/API key, provider read credentials or encrypted references, job lease and retry settings | Start one lease loop, cease leasing on shutdown, commit completed jobs and release or expire interrupted leases. Reuse the same domain transaction services as the API. |
| Vue app | Public API origin | Bundle only public configuration. Use the API for session, permissions, computed balances, and hosted billing URLs. |
| Migrations | Database migration credential scoped to the deployment environment | Run once before rolling out a compatible API and worker revision. Keep runtime database roles separate from schema ownership. |

## Proof per backend slice

A1 demonstrates concurrent confirmation creates one session. B2 demonstrates a second company's user cannot retrieve or mutate the first company's claim. P1–P4 demonstrate live/backfill overlap and refund-before-sale. F5 corrects a wrong attribution using an auditable reversal. L4 demonstrates €400 accrued − €150 recorded − €20 refund = €230 outstanding, including retry of the same payment command. S6 demonstrates the platform's own subscription never earns sales commission. Exercise these examples manually during implementation and turn them into automated regression coverage at backend completion under the [stack checks policy](../implementation/quality.md).
