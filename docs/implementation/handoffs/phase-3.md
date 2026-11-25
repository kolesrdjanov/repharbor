# Phase 3 · Sales ingestion

This is an interim audit for I3 and the Stripe ingestion portion of P1 in the commit that introduced this section.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Keep connection credentials server-side and scope mapping | `apps/api/src/integrations/connections.ts`, `providers.ts` | Connected a test fixture and mapped one product. The HTTP response carried status and account ID without credentials. |
| Authenticate signed raw bytes and commit before acknowledgment | `apps/api/src/main.ts`, `apps/api/src/integrations/inbox.ts` | A signed payload returned 204. An invalid signature returned 401. Wrong account and environment each returned 403 without posting a financial effect. |
| Deduplicate the event and the financial change independently | `apps/api/prisma/migrations/20261125004000_sales_ingress`, `apps/api/src/integrations/ingestion-worker.ts` | Two concurrent deliveries of the same ID returned 204 and created one inbox record. A separate event ID for the same invoice created no extra collection. |
| Handle an out-of-order refund | `apps/api/src/integrations/effects.ts` | The refund waited in a pending state until the original sale arrived and was linked to it by the original PaymentIntent. |
| Distinguish invoice lines, unknown mapping, and out-of-band payment | `apps/api/src/integrations/providers/stripe.ts` | The multi-product fixture preserved two separate lines with known basis. The unmapped product was reviewable. The invoice manually paid outside Stripe produced no effect. |
| Apply migration and build | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations` | Prisma applied the migration and reported no schema drift. The API built and the separate worker consumed signed deliveries. |

Ledger posting and source assignment are still due in L4/F5. The local run modeled webhook/backfill overlap as a second event for the same financial identity. Provider-controlled history and sandbox credentials have yet to be exercised. P2–P4 remain open until the Stripe statement slice works.

Next step is L4/F5. Add customer links and append-only ledger storage, then post the linked collection and refund from the worker and founder review path.

## P2–P4 adapter audit

The adapter follow-up commit completed the local webhook scenarios below. Each provider guide records credential and coverage requirements.

| Adapter | Implementation | Local observation |
|---|---|---|
| Dodo Payments | `apps/api/src/integrations/providers/dodo.ts` | A signed paid renewal yielded one collection. A failed payment yielded none. A refund delivered first linked to the payment after it arrived. Missing tax stayed reviewable. |
| Whop | `apps/api/src/integrations/providers/whop.ts` | A different signed account received 403. A replay did not create another effect. A membership ending produced no financial effect. The refund linked to the original payment. |
| RevenueCat | `apps/api/src/integrations/providers/revenuecat.ts` | The same mobile renewal reported under two event IDs yielded one effect. Unsubscribe produced no refund. Refund and refund reversal were kept for review, and the overlapping web sale was marked secondary. A production event on the sandbox connection received 403. |

The next unresolved checks are provider-controlled delivery and history. Dodo, Whop, Stripe and RevenueCat each need sandbox credentials and records. RevenueCat collections need exact basis evidence before automatic posting. The application and API continue to expose these cases for review.
