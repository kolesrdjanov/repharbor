# Phases 3–5 · Providers, statements, and reconciliation

Use [the work queue](README.md) for sequencing and [the product specification](../RepHarbor-V1.md) for balance definitions. Provider ingestion describes what happened financially. Customer attribution determines who receives commission. The ledger uses both.

## I3 · Shared ingestion and integration contract

**Owner:** backend/integrations. **Paths:** apps/api integrations module and worker, connector contracts, Prisma migrations.

1. Persist company-owned provider connections, environment, credential references, product mappings, authoritative channel, coverage start, sync cursor and status. Encrypt secrets and limit collection to the fields needed to calculate or reconcile commissions.
2. Define adapter operations for connection setup, webhook authentication, event normalization, and historical import where supported. A normalized record contains source account, environment, external event and transaction identifiers, line identifier where applicable, customer/product identifiers, event kind, effective time, amount, currency, tax or known basis, and original-sale reference for refunds. Support several product lines and zero-decimal currencies.
3. Authenticate before accepting data. Persist the incoming event and enqueue work atomically, then acknowledge receipt. A Postgres-backed worker can use leased jobs, bounded retries and a failed-job state. Capture the reason for a failure and support replay. Keep signed raw bytes available for verification on ingress.
4. Deduplicate deliveries by provider, source account, environment and event ID. Use separate unique keys for financial effects by transaction, line, and effect identity. A backfill that repeats a webhook must yield the same financial result. Record out-of-order refunds until the sale arrives. Distinguish cancellation, failed payment, trial, refund, and confirmed collection.
5. Include explicit dispositions for missing basis, unknown product, competing attribution, and secondary source. Keep reviewable records visible to the founder. Retain source evidence that explains the output while excluding credentials and unrelated buyer data from user-facing responses.

**Acceptance:** Replay the same delivery concurrently, import the same transaction, then send a refund before its sale. The resulting ledger has one effect per actual financial change. Invalid authentication and test events sent to a production connection produce no commission.

## P1–P4 · Independently assignable provider adapters

**Ownership:** One adapter directory, configuration instructions, and sanitized fixtures per provider owner. Depend on I3's contract. Each owner supplies evidence for connection setup, product/customer mapping, confirmed sale, renewal, cancellation, refund, duplicate delivery, and historical coverage. Record unsupported cases and the resulting UI status. Verify exact event names, fields, scopes, and account-plan requirements against current official docs during implementation.

| ID | Implementation work | Provider-specific acceptance |
|---|---|---|
| P1 · Stripe | Connect the founder's revenue account with scoped access. Map customer and product/price IDs, invoice lines and associated payments. Trace refunds back to the charged line or send ambiguous allocations to review. Preserve tax and discount treatment. Use separate credentials, webhook endpoints and account context for RepHarbor's own billing in S6. | A multi-product invoice credits only the mapped product. An invoice manually marked paid outside Stripe stays distinguishable from a confirmed Stripe collection. A renewal and partial refund affect the right rep once. [Stripe webhooks](https://docs.stripe.com/webhooks) |
| P2 · Dodo Payments | Identify business and environment from the connection, establish webhook verification, and map actual payment, subscription, product and refund identifiers. Document whether the source exposes the agreed sale basis, particularly tax-inclusive pricing, and how far history can be imported. | A paid renewal yields one collection. A failed or pending payment yields none. A partial refund matches the original collection. Missing tax information leads to “Needs review.” [Dodo webhooks](https://docs.dodopayments.com/developer-resources/webhooks) |
| P3 · Whop | Scope connection credentials to the founder's company. Inspect payment, membership, product/plan, currency, refund and fee data. Map the purchased product through its plan when necessary. Keep company-level account movements outside the sales adapter. | Two companies can sell similarly named plans without sharing records. Retried payment notifications yield one collection. An ended membership alone produces no refund. [Whop webhooks](https://docs.whop.com/developer/guides/webhooks) |
| P4 · RevenueCat | Scope by project, app, environment, store and product. Handle App User ID aliases and unresolved anonymous IDs. Check webhook access for the account plan, initial purchase, paid renewal, cancellation reason, refund reversal, historical refund coverage and availability of exact tax/basis. Map the original store transaction to the attributed customer. | A paid mobile renewal is counted once. An ordinary cancellation leaves past commissions intact. A Stripe web purchase also reported by RevenueCat uses the configured authoritative source. Estimated or missing basis and incomplete refund coverage are disclosed for review. [RevenueCat fields and coverage](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) |

## L4 · Ledger, balances, and manual external payments

**Owner:** backend. **Paths:** commission calculation, ledger, statements, and external-payment modules.

1. Resolve the attributed product/customer and accepted agreement as of the collection time. Handle first-payment-only and recurring terms, eligibility end, amendments, and engagement closure. Ambiguous identity or unresolved contract inputs go to review. Replay an eligible sale after its attribution is resolved.
2. Store calculation inputs on each posted entry. Use exact decimal or integer arithmetic, round in the currency's minor unit, and compute cumulative partial refund adjustments against the original amount so a full refund reverses exactly the original commission. A replay or rate change must preserve previous entries.
3. Implement itemized statements, due dates in company time, accrued amount, amount due, outstanding balance, and company credits. Group totals by currency and engagement before aggregating them for a portfolio. Use a stable sort and pagination for entries; compute totals over the full filtered period.
4. Implement founder-only external payment recording with amount, currency, date, optional reference, actor and idempotency key. Allocate partial payments per the agreed rule. Correct mistakes with a reasoned reversal linked to the prior record. Retain both entries. Block duplicate concurrent submissions. An unresolved opening balance must be visible to both parties.
5. Expose a shared statement response with entry details scoped to the viewer. The founder can inspect source matching evidence. The rep sees the basis, rate, source, date, and customer for their own sales. The app never initiates a money transfer.

**Acceptance:** Ten €200 sales accrue €400. Recording €150 leaves €250. A €100 eligible refund leaves €230. Repeat the payment request and replay the refund; the balance stays €230. Also exercise a full refund after payment, a zero-decimal currency, a different-currency balance, an unresolved opening balance, and renewal across a term boundary.

## U4 · Founder dashboard, rep portfolio, and shared statement

**Owner:** frontend. **Outputs:** role-aware dashboard and portfolio routes, engagement statement and detail views.

- Show outstanding, due now and recorded external payments with currency and date context. Group a rep's balances by company. Keep one line-item detail component for the shared calculation. Display the original sale, basis, rate, terms version and linked adjustment in readable order.
- Use shadcn-vue Table for statements, a Dialog for recording or reversing an external payment, and a Sheet or detail page for source details. Right-align numeric columns and use tabular numerals. On small screens preserve access to amount, customer, and status; keep remaining fields in details. Use text such as “Needs review,” “Company credit,” and “Recorded by founder.”
- Prevent accidental double submission and reuse the same request key on a retry with an uncertain result. Reload server totals after a mutation. Make the recorded payment date and audit history visible to the rep.

**Acceptance:** Independently sign in as each party. Trace the €230 example to its component entries on desktop and a narrow screen. Only the founder can record or reverse an external payment. Keyboard users can open and close the detail view and return to their place in the statement.

## F5 · Attribution and source resolution

**Owner:** backend. **Inputs:** B2 approved claims and I3 normalized transactions.

- Map provider products to the company's internal product and provider customer identities to the accepted claim. Define one authoritative source per product/channel for overlapping feeds. Scope every lookup to the same company, connection, and environment.
- Automatically link deterministic identifiers. A similar company name or matching contact email can suggest a candidate. Require founder confirmation for uncertain matches. Handle duplicate claims, aliases and a buyer paying with a different email.
- Allow a founder to resolve an unmatched record, record the decision, and rerun affected calculations. Correct posted attribution through linked reversing and replacement entries. Use a single transaction so competing founder actions cannot assign a sale twice.

**Acceptance:** A CEO registers and a different finance contact pays. The founder resolves the sale, the correct rep earns exactly one commission, and neither another rep nor another company can see the match candidates.

## U5 · Integrations and review UI

**Owner:** frontend. **Inputs:** I3 connection schema and F5 decision contract.

- Provide provider setup, credential handoff, product/channel mapping, connection status, coverage start, last successful sync, and reconnect/disconnect actions. Use provider-specific setup copy and recovery steps. Return only masked connection details to the browser after setup.
- Build one founder review queue with reasons, candidate records, affected amounts, and a decision dialog. Show when stale data or incomplete history affects a shared statement. Confirming a match links back to the resulting statement entry.

**Acceptance:** A founder connects a test provider, maps a product, resolves the different-email case, and sees the entry in the statement. A rep is unable to access credentials, candidates, or unrelated records. A disconnected feed visibly stops advancing its coverage.

## R5 · Backfill, replay, and coverage

**Owner:** worker/operations. **Inputs:** I3 plus one adapter at a time.

- Backfill in checkpointed batches from the confirmed start date. Use the same normalization and deduplication as live ingestion. Resume after failure; collect unsupported intervals as coverage gaps. Reconcile refunds or missed events using each provider's supported records.
- Track last delivery and last successful reconciliation separately. Expose diagnostic counts and replay by connection and date range. Scope retries to affected records and record why a correction changed a statement.
- Document how operators investigate a provider outage and recover with test data. Where an API cannot reconstruct a period, preserve “coverage unknown” and allow an explicitly agreed opening balance with supporting note, currency, date, and both parties' acknowledgment.

**Acceptance:** Interrupt an import halfway, receive an overlapping webhook, then resume. Compare the resulting statement to an uninterrupted import. Confirm the same postings and balances, a moved coverage checkpoint, and a visible gap for any unsupported period.
