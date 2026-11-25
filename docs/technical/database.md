# PostgreSQL and Prisma implementation

Apply [schema.sql](schema.sql) only to a disposable, empty database when reviewing the design. For the application, keep Prisma models and migrations in apps/api/prisma. Use explicit table/column mappings, PostgreSQL UUID, timestamptz, date, bigint, and JSONB types. Use restrictive foreign keys on financial history. Reserve JSON for provider envelopes, job arguments, and audit details. Model tenancy, money, and relationships as columns.

## Entity relationships and migration order

| Slice | Tables | Write boundary and query path |
|---|---|---|
| A1 | app_user, login_link, user_session | Normalize email consistently. Store token digests. Consume an unexpired unused link and issue exactly one session inside one transaction. Expired sessions are excluded on each request. |
| B2 | company, company_founder, product, engagement, invitation, agreement_version, claim | Company creation also inserts founder membership. Engagement identifies one company/product/rep relationship. A founder invitation may precede knowing the company. Assign company/product on acceptance by its founder. Founder submission signs the proposed version; rep acceptance signs exactly that revision. |
| I3 | connection, product_mapping, source_authority, inbound_event, job, sale_effect | Connection identity includes provider, account/project scope and test/live mode. Persist the event and its job together. One event can report multiple lines. Backfill and live deliveries use the same financial effect identity. |
| F5, R5 | customer_link, review_item, coverage_gap, opening_balance | Match provider customer plus product to an approved claim. A claim is the canonical customer attribution across its mapped provider identities. Record reassignments and reprocess affected entries. Both parties acknowledge an imported opening balance. |
| L4 | external_payment, ledger_entry, idempotency_record, audit_event | Write the business change, signed ledger delta, audit event and replay result atomically. Create idempotency/audit infrastructure as soon as B2 needs it. Ledger rows are append-only for the runtime role. |
| S6 | billing_account, billing_event | Separate Stripe customer and event namespace for the company's RepHarbor subscription. |

~~~mermaid
erDiagram
  COMPANY ||--o{ PRODUCT : owns
  PRODUCT ||--o{ ENGAGEMENT : covers
  ENGAGEMENT ||--o{ AGREEMENT_VERSION : versions
  ENGAGEMENT ||--o{ CLAIM : registers
  CLAIM ||--o{ CUSTOMER_LINK : identifies
  COMPANY ||--o{ CONNECTION : connects
  CONNECTION ||--o{ SALE_EFFECT : reports
  SALE_EFFECT ||--o{ LEDGER_ENTRY : generates
  ENGAGEMENT ||--o{ LEDGER_ENTRY : accrues
  EXTERNAL_PAYMENT ||--o{ LEDGER_ENTRY : records
~~~

## Integrity beyond foreign keys

- Authorize by membership or engagement rep on the server. A billing customer, external product identifier, or caller-supplied company ID is insufficient proof of ownership. Use composite tenant foreign keys whenever a write spans two company-owned resources.
- Lock the engagement before proposing or accepting terms. Compare the expected revision. Two concurrent clicks on different versions must never accept stale terms. Preserve accepted financial fields. Lock any affected claim before assigning an identity. Enforce approved state and company/product match, including for historical reassignments.
- Lock the product/channel authority during mapping changes. Verify the connection's environment matches the authority record. Treat a changed historical authority as a reconciliation job requiring explicit corrections. Otherwise a replay could reprice an earlier statement. Isolate test records from live statements and balances, including joins during replay.
- Lock a claim/engagement while ordering eligible collections for first-payment and eligibility-window rules. Sort by provider occurrence time and stable source key; late earlier collections require reversing superseded entries and reposting. Serialize refunds on the original sale line. Validate matching currency, source connection, original event and remaining refundable amount.
- A job worker owns a lease token. Compare the token on acknowledgment so a late worker cannot finish a reclaimed job. Persist the financial effects and completion in one database transaction. External provider pagination runs outside that transaction. Advance the cursor only after its batch commits.
- Restrict updates to operational statuses or acceptance fields. Keep ledger rows immutable. For a payment correction, lock the original row and reverse its original signed amount once in the same currency and engagement. Uniqueness on posting_key and reverses_id detects duplicates. A reason and actor identify every manual correction.

## Computing a statement

Use UTC instants for business events, an IANA zone snapshot for agreement terms, and a local date for due_on and paid_on. Compute the monthly cutoff in the agreement zone before converting to UTC. Date ranges are half-open. For a date-only external payment use the start of that date in the agreement zone as its effective instant; posted_at preserves when it was entered.

Use integer minor units and basis points. For a positive collection, calculate basis_minor × rate_bps / 10,000 using exact arithmetic and round half up to the currency's minor unit. For a refund, compute the rounded commission on cumulative refunded basis, subtract what was already reversed, then post the negative difference. A full refund must unwind the original commission exactly. A refund reversal restores only the amount previously reversed.

Outstanding equals the sum of signed deltas grouped by engagement and currency. Commission increases the company's debt, refunds and external payments reduce it. An opening balance can have either sign. A reversal has the opposite sign of its referenced entry and inherits its reporting category. Accrued excludes opening balances and external payments. Recorded payments show positive amounts net of reversals. Keep a credit as a signed outstanding amount; display due as at least zero.

For due calculations, reduce the original accrual by related refunds, then apply external payments and other available credits to open accruals in ascending due-date and entry-ID order within the same engagement and currency. Allocate a confirmed positive opening balance on its agreed opening date. Recompute allocations deterministically for a historical cutoff. Never offset EUR against USD. For a consistent paged view, freeze both effective_at and posted_at at the same asOf timestamp and use the identical cutoff for totals. Entries backdated after that snapshot appear on a fresh statement.

## Query and migration ownership

Index founder membership by user for the company selector, engagement by rep for the portfolio, claims by engagement/status, review items by company/resolution, inbox deduplication keys and ledger by engagement/currency/effective time. The DDL includes the principal constraints and hot-path indexes. Add further indexes against measured queries. Exclude credentials and raw provider payloads from joins projected to reps.

Start each slice with an additive migration. Backfill new fields in bounded batches before making them required. Use custom migration SQL for check constraints and partial indexes and retain it alongside Prisma history. Deployment uses one migration runner before API/worker promotion. Record the last compatible application version before a destructive migration and rehearse recovery on a disposable database. PostgreSQL documents the row-local limits of check constraints. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
