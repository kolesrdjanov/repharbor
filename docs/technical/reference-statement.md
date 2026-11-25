# Konvuno reference statement

The development seed creates Konvuno, its product, the founder, Dimitrije, and one proposed agreement. It also creates an unrelated company and two unrelated accounts for access checks. The fixture identifiers, account addresses, contract payloads, payment, and refund are in [the shared fixtures](../../packages/contracts/src/reference.ts).

The proposal uses 2,000 basis points of collected revenue after discounts, excluding tax and before processing fees. It covers 12 months from the first eligible payment, including renewals. Statements use Europe/Belgrade and are due on the 10th of the following month. Open the history with a zero balance on November 1, 2026. For the primary fixture, take the statement snapshot after December 10.

| Event | Count | Eligible amount each | Commission or balance change |
|---|---:|---:|---:|
| Initial sales | 10 | €200.00 | +€400.00 |
| Founder records external payment | 1 | €150.00 | −€150.00 |
| Partial refund on the first sale | 1 | €100.00 | −€20.00 |
| Outstanding after refund | | | **€230.00** |

The first contact and payer use different email addresses. The founder confirms the customer mapping before RepHarbor accredits the sale. A separate December renewal of €200 from that same customer adds €40 under the recurring agreement. It falls outside the primary balance example.

The fixture is independent of the ledger implementation. The proposed agreement remains unsigned by the rep after seeding. Sales and money records are inputs to the later Stripe and commission demonstration.

## Workflow examples

Request and response shapes, access rules, and success codes are in the [canonical OpenAPI document](openapi.yaml). Error responses below also carry a request ID. An empty list is represented by `{"items":[]}`.

| Workflow | Success | Empty state | Recoverable error |
|---|---|---|---|
| Identity and companies | `getSession` returns the verified email and companies | A new user has `companies: []` | `401 UNAUTHENTICATED` prompts sign-in |
| Engagement and terms | Founder proposes revision 1, and the rep accepts it | An invited rep has no accepted terms | `409 STALE_REVISION` prompts a refresh |
| Claims | A founder approves a submitted claim | A new engagement has no claims | An inaccessible claim returns 404 |
| Provider connection | A test connection identifies its provider and status | A new company has no connections | An invalid setup returns 422 |
| Statement and entry | Both roles receive `outstandingMinor: "23000"` and an itemized trail | A new engagement has no balances or entries | An inaccessible statement or entry returns 404 |
| External payment | A founder records `amountMinor: "15000"` with a fresh key | An empty statement has no payment entries | `409 IDEMPOTENCY_CONFLICT` indicates a reused key with different input |
